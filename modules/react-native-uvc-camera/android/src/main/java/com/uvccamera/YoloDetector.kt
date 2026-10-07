package com.uvccamera

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Runs the AVISO YOLOv8n model (assets/aviso-yolov8.tflite) on camera frames.
 *
 * Model contract (checked against the exported file):
 *  - input  float32 [1, 3, S, S] (channels first) or [1, S, S, 3], RGB scaled to 0..1, letterboxed with gray 114
 *  - output float32 [1, 4 + classes, N]: cx, cy, w, h (normalized 0..1) + one score per class, no NMS
 *
 * Boxes are returned top-left x, y, w, h as fractions of the source frame, matching classify() in the app.
 * One shared instance: only one camera runs detection at a time. Not thread-safe across callers, so
 * detect() is synchronized.
 */
class YoloDetector private constructor(context: Context) {

    data class Detection(
        val classIndex: Int,
        val confidence: Float,
        val x: Float,
        val y: Float,
        val w: Float,
        val h: Float,
    )

    private val gpuDelegate: GpuDelegate?
    private val interpreter: Interpreter
    val delegateName: String

    private val inputSize: Int
    private val channelsFirst: Boolean
    private val numChannels: Int
    private val numAnchors: Int
    private val outputChannelsFirst: Boolean
    private val numClasses: Int

    private val inputBuffer: ByteBuffer
    private val inputArray: FloatArray
    private val outputBuffer: ByteBuffer
    private val outputArray: FloatArray

    // Letterbox geometry, recomputed only when the frame size changes
    private var lastFrameW = -1
    private var lastFrameH = -1
    private var scale = 1f
    private var padX = 0
    private var padY = 0
    private var scaledW = 0
    private var scaledH = 0
    // Bilinear sampling tables (cv2.INTER_LINEAR): two source columns / rows and the weight of the second
    private var x0Lut = IntArray(0)
    private var x1Lut = IntArray(0)
    private var xWeight = FloatArray(0)
    private var y0Lut = IntArray(0)
    private var y1Lut = IntArray(0)
    private var yWeight = FloatArray(0)

    // Source rows already resized horizontally (RGB floats, 0..255); upscaling reuses each one
    private var rowA = FloatArray(0)
    private var rowB = FloatArray(0)
    private var rowAIndex = -1
    private var rowBIndex = -1

    init {
        val model = loadModel(context)
        var delegate: GpuDelegate? = null
        var created: Interpreter? = null

        val compat = CompatibilityList()
        if (compat.isDelegateSupportedOnThisDevice) {
            try {
                delegate = GpuDelegate(compat.bestOptionsForThisDevice)
                created = Interpreter(model, Interpreter.Options().addDelegate(delegate))
            } catch (e: Throwable) {
                Log.w(TAG, "GPU delegate failed, falling back to CPU: ${e.message}")
                delegate?.close()
                delegate = null
            }
        }
        if (created == null) {
            created = Interpreter(model, Interpreter.Options().setNumThreads(4))
        }
        gpuDelegate = delegate
        interpreter = created
        delegateName = if (delegate != null) "GPU" else "CPU"

        val inShape = interpreter.getInputTensor(0).shape()
        channelsFirst = inShape[1] == 3
        inputSize = if (channelsFirst) inShape[2] else inShape[1]

        val outShape = interpreter.getOutputTensor(0).shape()
        outputChannelsFirst = outShape[1] < outShape[2]
        numChannels = if (outputChannelsFirst) outShape[1] else outShape[2]
        numAnchors = if (outputChannelsFirst) outShape[2] else outShape[1]
        numClasses = numChannels - 4

        inputArray = FloatArray(3 * inputSize * inputSize)
        inputBuffer = ByteBuffer.allocateDirect(inputArray.size * 4).order(ByteOrder.nativeOrder())
        outputArray = FloatArray(numChannels * numAnchors)
        outputBuffer = ByteBuffer.allocateDirect(outputArray.size * 4).order(ByteOrder.nativeOrder())

        Log.i(
            TAG,
            "Loaded model on $delegateName: input ${inShape.contentToString()}, " +
                "output ${outShape.contentToString()}, $numClasses classes"
        )
    }

    /**
     * @param pixels packed frame bytes, [bytesPerPixel] bytes per pixel in R, G, B(, X) order
     * @param rowStride bytes per row (may be larger than width * bytesPerPixel)
     */
    @Synchronized
    fun detect(
        pixels: ByteArray,
        width: Int,
        height: Int,
        bytesPerPixel: Int,
        rowStride: Int = width * bytesPerPixel,
    ): List<Detection> {
        fillInput(pixels, width, height, bytesPerPixel, rowStride)

        inputBuffer.rewind()
        inputBuffer.asFloatBuffer().put(inputArray)
        outputBuffer.rewind()
        interpreter.run(inputBuffer, outputBuffer)
        outputBuffer.rewind()
        outputBuffer.asFloatBuffer().get(outputArray)

        return decode(width, height)
    }

    fun close() {
        interpreter.close()
        gpuDelegate?.close()
    }

    private fun fillInput(pixels: ByteArray, width: Int, height: Int, bpp: Int, rowStride: Int) {
        val s = inputSize
        if (width != lastFrameW || height != lastFrameH) {
            scale = min(s.toFloat() / width, s.toFloat() / height)
            scaledW = (width * scale).roundToInt().coerceIn(1, s)
            scaledH = (height * scale).roundToInt().coerceIn(1, s)
            padX = (s - scaledW) / 2
            padY = (s - scaledH) / 2
            // Same sample positions as cv2.resize(INTER_LINEAR): src = (dst + 0.5) / scale - 0.5
            val sx = FloatArray(scaledW) { (((it + 0.5f) / scale) - 0.5f).coerceIn(0f, (width - 1).toFloat()) }
            x0Lut = IntArray(scaledW) { sx[it].toInt() }
            x1Lut = IntArray(scaledW) { min(x0Lut[it] + 1, width - 1) }
            xWeight = FloatArray(scaledW) { sx[it] - x0Lut[it] }
            val sy = FloatArray(scaledH) { (((it + 0.5f) / scale) - 0.5f).coerceIn(0f, (height - 1).toFloat()) }
            y0Lut = IntArray(scaledH) { sy[it].toInt() }
            y1Lut = IntArray(scaledH) { min(y0Lut[it] + 1, height - 1) }
            yWeight = FloatArray(scaledH) { sy[it] - y0Lut[it] }
            rowA = FloatArray(scaledW * 3)
            rowB = FloatArray(scaledW * 3)
            inputArray.fill(PAD_VALUE)
            lastFrameW = width
            lastFrameH = height
        }
        rowAIndex = -1
        rowBIndex = -1

        val plane = s * s
        for (yy in 0 until scaledH) {
            val top = resizedRow(pixels, y0Lut[yy], bpp, rowStride, keepRow = y1Lut[yy])
            val bottom = resizedRow(pixels, y1Lut[yy], bpp, rowStride, keepRow = y0Lut[yy])
            val fy = yWeight[yy]
            var dst = (padY + yy) * s + padX
            for (xx in 0 until scaledW) {
                val i3 = xx * 3
                // cv2 keeps uint8 after resizing, so round before scaling to 0..1
                val r = BYTE_TO_FLOAT[(top[i3] + (bottom[i3] - top[i3]) * fy + 0.5f).toInt().coerceIn(0, 255)]
                val g = BYTE_TO_FLOAT[(top[i3 + 1] + (bottom[i3 + 1] - top[i3 + 1]) * fy + 0.5f).toInt().coerceIn(0, 255)]
                val b = BYTE_TO_FLOAT[(top[i3 + 2] + (bottom[i3 + 2] - top[i3 + 2]) * fy + 0.5f).toInt().coerceIn(0, 255)]
                if (channelsFirst) {
                    inputArray[dst] = r
                    inputArray[plane + dst] = g
                    inputArray[2 * plane + dst] = b
                } else {
                    val i = dst * 3
                    inputArray[i] = r
                    inputArray[i + 1] = g
                    inputArray[i + 2] = b
                }
                dst++
            }
        }
    }

    /** One source row resized horizontally; two rows stay cached because consecutive output rows share them. */
    private fun resizedRow(pixels: ByteArray, srcRow: Int, bpp: Int, rowStride: Int, keepRow: Int): FloatArray {
        if (rowAIndex == srcRow) return rowA
        if (rowBIndex == srcRow) return rowB
        val useA = rowAIndex != keepRow
        val out = if (useA) rowA else rowB
        if (useA) rowAIndex = srcRow else rowBIndex = srcRow

        val rowStart = srcRow * rowStride
        for (xx in 0 until scaledW) {
            val p0 = rowStart + x0Lut[xx] * bpp
            val p1 = rowStart + x1Lut[xx] * bpp
            val fx = xWeight[xx]
            val i3 = xx * 3
            for (c in 0 until 3) {
                val a = (pixels[p0 + c].toInt() and 0xFF).toFloat()
                val b = (pixels[p1 + c].toInt() and 0xFF).toFloat()
                out[i3 + c] = a + (b - a) * fx
            }
        }
        return out
    }

    private fun value(channel: Int, anchor: Int): Float =
        if (outputChannelsFirst) outputArray[channel * numAnchors + anchor]
        else outputArray[anchor * numChannels + channel]

    private fun decode(frameW: Int, frameH: Int): List<Detection> {
        // Ultralytics TFLite exports normally give 0..1 coords; older ones give model pixels.
        var coordMax = 0f
        for (a in 0 until numAnchors) coordMax = max(coordMax, value(2, a))
        val toPixels = if (coordMax <= 2f) inputSize.toFloat() else 1f

        val candidates = ArrayList<FloatArray>() // [x0, y0, x1, y1, conf, class] in model pixels
        for (a in 0 until numAnchors) {
            var best = 0
            var bestScore = value(4, a)
            for (c in 1 until numClasses) {
                val sc = value(4 + c, a)
                if (sc > bestScore) {
                    bestScore = sc
                    best = c
                }
            }
            if (bestScore < CONFIDENCE_THRESHOLD) continue
            val cx = value(0, a) * toPixels
            val cy = value(1, a) * toPixels
            val w = value(2, a) * toPixels
            val h = value(3, a) * toPixels
            candidates.add(floatArrayOf(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, bestScore, best.toFloat()))
        }
        candidates.sortByDescending { it[4] }

        val kept = ArrayList<FloatArray>()
        for (cand in candidates) {
            if (kept.size >= MAX_DETECTIONS) break
            val overlaps = kept.any { it[5] == cand[5] && iou(it, cand) > IOU_THRESHOLD }
            if (!overlaps) kept.add(cand)
        }

        return kept.map { box ->
            val x0 = ((box[0] - padX) / scale / frameW).coerceIn(0f, 1f)
            val y0 = ((box[1] - padY) / scale / frameH).coerceIn(0f, 1f)
            val x1 = ((box[2] - padX) / scale / frameW).coerceIn(0f, 1f)
            val y1 = ((box[3] - padY) / scale / frameH).coerceIn(0f, 1f)
            Detection(box[5].toInt(), box[4], x0, y0, x1 - x0, y1 - y0)
        }
    }

    private fun iou(a: FloatArray, b: FloatArray): Float {
        val iw = max(0f, min(a[2], b[2]) - max(a[0], b[0]))
        val ih = max(0f, min(a[3], b[3]) - max(a[1], b[1]))
        val inter = iw * ih
        val union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
        return if (union <= 0f) 0f else inter / union
    }

    companion object {
        private const val TAG = "YoloDetector"
        private const val MODEL_ASSET = "aviso-yolov8.tflite"
        private const val CONFIDENCE_THRESHOLD = 0.25f // Ultralytics predict default (conf=0.25)
        private const val IOU_THRESHOLD = 0.7f // Ultralytics predict default (iou=0.7)
        private const val MAX_DETECTIONS = 100
        private const val PAD_VALUE = 114f / 255f
        private val BYTE_TO_FLOAT = FloatArray(256) { it / 255f }

        @Volatile
        private var instance: YoloDetector? = null

        /** Loads the model on first use (slow: do not call on the UI thread). */
        fun get(context: Context): YoloDetector =
            instance ?: synchronized(this) {
                instance ?: YoloDetector(context.applicationContext).also { instance = it }
            }

        private fun loadModel(context: Context): ByteBuffer {
            val bytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
            return ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
                put(bytes)
                rewind()
            }
        }

        /** Serializes detections, mapping frame coords into a sub-rectangle of the view (all values 0..1). */
        fun toJson(
            detections: List<Detection>,
            offsetX: Float = 0f,
            offsetY: Float = 0f,
            scaleX: Float = 1f,
            scaleY: Float = 1f,
        ): String {
            val array = JSONArray()
            for (d in detections) {
                array.put(
                    JSONObject()
                        .put("classIndex", d.classIndex)
                        .put("confidence", d.confidence.toDouble())
                        .put("x", (offsetX + d.x * scaleX).toDouble())
                        .put("y", (offsetY + d.y * scaleY).toDouble())
                        .put("w", (d.w * scaleX).toDouble())
                        .put("h", (d.h * scaleY).toDouble())
                )
            }
            return array.toString()
        }
    }
}
