package com.uvccamera

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.zip.CRC32
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Runs the AVISO YOLOv8n model (assets/aviso-yolov8.tflite) on camera frames.
 *
 * Model contract (checked against the exported file):
 *  - input  float32 [1, 3, H, W] (channels first) or [1, H, W, 3], RGB scaled to 0..1, letterboxed with gray 114.
 *    H and W may differ (e.g. 544x960 for a 16:9 camera), so the frame is fitted to both separately.
 *  - output float32 [1, 4 + classes, N]: cx, cy, w, h (normalized 0..1) + one score per class, no NMS
 *
 * Boxes are returned top-left x, y, w, h as fractions of the source frame, matching classify() in the app.
 * One shared instance, owned by a single detector thread: the GPU delegate is created and always run
 * on that thread, whichever camera (USB or phone) submits frames. Callers block until their frame is done.
 *
 * The GPU's compiled programs are cached on disk (GPU delegate serialization), so only the first load
 * after installing a model is slow; later app starts reuse the cache.
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

    /** Time spent in each step of the last detect() call, in milliseconds. */
    data class Timings(val prepMs: Double, val modelMs: Double, val boxesMs: Double)

    @Volatile
    var lastTimings = Timings(0.0, 0.0, 0.0)
        private set

    private val inputW: Int
    private val inputH: Int
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

    // Source rows already resized horizontally (RGB floats, 0..255), one cache per prep worker
    private class RowCache(width: Int) {
        val rowA = FloatArray(width * 3)
        val rowB = FloatArray(width * 3)
        var rowAIndex = -1
        var rowBIndex = -1
    }
    private var rowCaches: Array<RowCache> = emptyArray()

    init {
        val modelBytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
        val model = ByteBuffer.allocateDirect(modelBytes.size).order(ByteOrder.nativeOrder()).apply {
            put(modelBytes)
            rewind()
        }
        // Cache key changes whenever the bundled model file changes, so a stale cache is never reused.
        val modelToken = "$MODEL_VERSION-${CRC32().apply { update(modelBytes) }.value.toString(16)}"
        val startMs = SystemClock.elapsedRealtime()
        var delegate: GpuDelegate? = null
        var created: Interpreter? = null

        val compat = CompatibilityList()
        if (compat.isDelegateSupportedOnThisDevice) {
            try {
                // Lets the GPU compute in FP16 even though the model file is FP32 (faster, near-identical results).
                // Serialization saves the compiled GPU programs, turning later loads from minutes into seconds.
                delegate = GpuDelegate(
                    compat.bestOptionsForThisDevice.apply {
                        setPrecisionLossAllowed(true)
                        setSerializationParams(context.codeCacheDir.absolutePath, modelToken)
                    }
                )
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
        inputH = if (channelsFirst) inShape[2] else inShape[1]
        inputW = if (channelsFirst) inShape[3] else inShape[2]

        val outShape = interpreter.getOutputTensor(0).shape()
        outputChannelsFirst = outShape[1] < outShape[2]
        numChannels = if (outputChannelsFirst) outShape[1] else outShape[2]
        numAnchors = if (outputChannelsFirst) outShape[2] else outShape[1]
        numClasses = numChannels - 4

        inputArray = FloatArray(3 * inputW * inputH)
        inputBuffer = ByteBuffer.allocateDirect(inputArray.size * 4).order(ByteOrder.nativeOrder())
        outputArray = FloatArray(numChannels * numAnchors)
        outputBuffer = ByteBuffer.allocateDirect(outputArray.size * 4).order(ByteOrder.nativeOrder())

        Log.i(
            TAG,
            "Loaded model on $delegateName in ${SystemClock.elapsedRealtime() - startMs} ms " +
                "(thread ${Thread.currentThread().name}): input ${inShape.contentToString()}, " +
                "output ${outShape.contentToString()}, $numClasses classes"
        )
    }

    /**
     * @param pixels packed frame bytes, [bytesPerPixel] bytes per pixel in R, G, B(, X) order
     * @param rowStride bytes per row (may be larger than width * bytesPerPixel)
     */
    fun detect(
        pixels: ByteArray,
        width: Int,
        height: Int,
        bytesPerPixel: Int,
        rowStride: Int = width * bytesPerPixel,
    ): List<Detection> = onDetectorThread { detectNow(pixels, width, height, bytesPerPixel, rowStride) }

    private fun detectNow(
        pixels: ByteArray,
        width: Int,
        height: Int,
        bytesPerPixel: Int,
        rowStride: Int,
    ): List<Detection> {
        val t0 = SystemClock.elapsedRealtimeNanos()
        fillInput(pixels, width, height, bytesPerPixel, rowStride)
        inputBuffer.rewind()
        inputBuffer.asFloatBuffer().put(inputArray)

        val t1 = SystemClock.elapsedRealtimeNanos()
        outputBuffer.rewind()
        interpreter.run(inputBuffer, outputBuffer)
        outputBuffer.rewind()
        outputBuffer.asFloatBuffer().get(outputArray)

        val t2 = SystemClock.elapsedRealtimeNanos()
        val detections = decode(width, height)
        val t3 = SystemClock.elapsedRealtimeNanos()

        lastTimings = Timings((t1 - t0) / 1e6, (t2 - t1) / 1e6, (t3 - t2) / 1e6)
        return detections
    }

    fun close() {
        interpreter.close()
        gpuDelegate?.close()
    }

    private fun fillInput(pixels: ByteArray, width: Int, height: Int, bpp: Int, rowStride: Int) {
        if (width != lastFrameW || height != lastFrameH) {
            scale = min(inputW.toFloat() / width, inputH.toFloat() / height)
            scaledW = (width * scale).roundToInt().coerceIn(1, inputW)
            scaledH = (height * scale).roundToInt().coerceIn(1, inputH)
            padX = (inputW - scaledW) / 2
            padY = (inputH - scaledH) / 2
            // Same sample positions as cv2.resize(INTER_LINEAR): src = (dst + 0.5) / scale - 0.5
            val sx = FloatArray(scaledW) { (((it + 0.5f) / scale) - 0.5f).coerceIn(0f, (width - 1).toFloat()) }
            x0Lut = IntArray(scaledW) { sx[it].toInt() }
            x1Lut = IntArray(scaledW) { min(x0Lut[it] + 1, width - 1) }
            xWeight = FloatArray(scaledW) { sx[it] - x0Lut[it] }
            val sy = FloatArray(scaledH) { (((it + 0.5f) / scale) - 0.5f).coerceIn(0f, (height - 1).toFloat()) }
            y0Lut = IntArray(scaledH) { sy[it].toInt() }
            y1Lut = IntArray(scaledH) { min(y0Lut[it] + 1, height - 1) }
            yWeight = FloatArray(scaledH) { sy[it] - y0Lut[it] }
            rowCaches = Array(PREP_THREADS) { RowCache(scaledW) }
            inputArray.fill(PAD_VALUE)
            lastFrameW = width
            lastFrameH = height
        }

        // Each worker fills its own band of output rows; bands share no memory, so no locking is needed.
        val band = (scaledH + PREP_THREADS - 1) / PREP_THREADS
        val jobs = (0 until PREP_THREADS).mapNotNull { w ->
            val from = w * band
            val to = min(scaledH, from + band)
            if (from >= to) null
            else Callable { fillRows(pixels, bpp, rowStride, from, to, rowCaches[w]) }
        }
        for (f in PREP_POOL.invokeAll(jobs)) f.get()
    }

    private fun fillRows(pixels: ByteArray, bpp: Int, rowStride: Int, from: Int, to: Int, cache: RowCache) {
        cache.rowAIndex = -1
        cache.rowBIndex = -1
        val plane = inputW * inputH
        val input = inputArray
        for (yy in from until to) {
            val top = resizedRow(pixels, y0Lut[yy], bpp, rowStride, keepRow = y1Lut[yy], cache = cache)
            val bottom = resizedRow(pixels, y1Lut[yy], bpp, rowStride, keepRow = y0Lut[yy], cache = cache)
            val fy = yWeight[yy]
            var dst = (padY + yy) * inputW + padX
            var i3 = 0
            for (xx in 0 until scaledW) {
                // cv2 keeps uint8 after resizing, so round before scaling to 0..1 (values stay within 0..255)
                val r = BYTE_TO_FLOAT[(top[i3] + (bottom[i3] - top[i3]) * fy + 0.5f).toInt()]
                val g = BYTE_TO_FLOAT[(top[i3 + 1] + (bottom[i3 + 1] - top[i3 + 1]) * fy + 0.5f).toInt()]
                val b = BYTE_TO_FLOAT[(top[i3 + 2] + (bottom[i3 + 2] - top[i3 + 2]) * fy + 0.5f).toInt()]
                if (channelsFirst) {
                    input[dst] = r
                    input[plane + dst] = g
                    input[2 * plane + dst] = b
                } else {
                    val i = dst * 3
                    input[i] = r
                    input[i + 1] = g
                    input[i + 2] = b
                }
                dst++
                i3 += 3
            }
        }
    }

    /** One source row resized horizontally; two rows stay cached because consecutive output rows share them. */
    private fun resizedRow(
        pixels: ByteArray,
        srcRow: Int,
        bpp: Int,
        rowStride: Int,
        keepRow: Int,
        cache: RowCache,
    ): FloatArray {
        if (cache.rowAIndex == srcRow) return cache.rowA
        if (cache.rowBIndex == srcRow) return cache.rowB
        val useA = cache.rowAIndex != keepRow
        val out = if (useA) cache.rowA else cache.rowB
        if (useA) cache.rowAIndex = srcRow else cache.rowBIndex = srcRow

        val rowStart = srcRow * rowStride
        var i3 = 0
        for (xx in 0 until scaledW) {
            val p0 = rowStart + x0Lut[xx] * bpp
            val p1 = rowStart + x1Lut[xx] * bpp
            val fx = xWeight[xx]
            val r0 = (pixels[p0].toInt() and 0xFF).toFloat()
            val g0 = (pixels[p0 + 1].toInt() and 0xFF).toFloat()
            val b0 = (pixels[p0 + 2].toInt() and 0xFF).toFloat()
            out[i3] = r0 + ((pixels[p1].toInt() and 0xFF) - r0) * fx
            out[i3 + 1] = g0 + ((pixels[p1 + 1].toInt() and 0xFF) - g0) * fx
            out[i3 + 2] = b0 + ((pixels[p1 + 2].toInt() and 0xFF) - b0) * fx
            i3 += 3
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
        val normalized = coordMax <= 2f
        val toPixelsX = if (normalized) inputW.toFloat() else 1f
        val toPixelsY = if (normalized) inputH.toFloat() else 1f

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
            if (bestScore < EVIDENCE_THRESHOLD) continue
            val cx = value(0, a) * toPixelsX
            val cy = value(1, a) * toPixelsY
            val w = value(2, a) * toPixelsX
            val h = value(3, a) * toPixelsY
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
        /** Which exported model is bundled in assets; shown on the camera screen. Update when the file changes. */
        const val MODEL_VERSION = "v6-960x544-fp32"
        /**
         * Weakest detection passed to the app. Weak but steady objects still count as evidence for
         * "possible" warnings; boxes are only drawn from [DRAW_THRESHOLD].
         */
        private const val EVIDENCE_THRESHOLD = 0.15f
        /** Boxes drawn on the video, like Ultralytics predict's default (conf=0.25). */
        const val DRAW_THRESHOLD = 0.25f
        private const val IOU_THRESHOLD = 0.7f // Ultralytics predict default (iou=0.7)
        private const val MAX_DETECTIONS = 100
        private const val PAD_VALUE = 114f / 255f
        private val BYTE_TO_FLOAT = FloatArray(256) { it / 255f }

        /** Rows of the frame are shrunk on this many CPU cores in parallel. */
        private const val PREP_THREADS = 4
        private val PREP_POOL: ExecutorService = Executors.newFixedThreadPool(PREP_THREADS) { r ->
            Thread(r, "yolo-prep").apply { isDaemon = true }
        }

        /** The only thread that creates and runs the model (GPU delegates must stay on one thread). */
        private val DETECTOR_THREAD: ExecutorService = Executors.newSingleThreadExecutor { r ->
            Thread(r, "yolo-detector").apply { isDaemon = true }
        }

        enum class Status { IDLE, LOADING, READY, FAILED }

        @Volatile
        var status = Status.IDLE
            private set

        @Volatile
        var failureMessage: String? = null
            private set

        @Volatile
        private var instance: YoloDetector? = null

        private fun <T> onDetectorThread(block: () -> T): T {
            try {
                return DETECTOR_THREAD.submit(Callable { block() }).get()
            } catch (e: ExecutionException) {
                throw e.cause ?: e
            }
        }

        /** Must run on DETECTOR_THREAD. */
        private fun loadNow(context: Context): YoloDetector {
            instance?.let { return it }
            status = Status.LOADING
            return try {
                YoloDetector(context.applicationContext).also {
                    instance = it
                    status = Status.READY
                }
            } catch (e: Throwable) {
                failureMessage = e.message ?: e.javaClass.simpleName
                status = Status.FAILED
                throw e
            }
        }

        /**
         * Returns the loaded model, loading it first if needed (slow: never call on the UI thread).
         * Blocks until the detector thread has it ready.
         */
        fun get(context: Context): YoloDetector = instance ?: onDetectorThread { loadNow(context) }

        /**
         * Starts loading in the background (e.g. when the camera tab opens) so the first frame doesn't wait.
         * The future completes when the model is ready, or fails with the load error.
         */
        fun prepare(context: Context): Future<YoloDetector> =
            DETECTOR_THREAD.submit(Callable { loadNow(context) })

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
