package com.uvccamera

import android.graphics.Bitmap
import android.util.Log
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.imgproc.Imgproc
import java.util.Locale
import kotlin.math.max

/**
 * Draws detections exactly like Ultralytics' `results.plot()`: a port of `Colors` and
 * `Annotator.box_label` (ultralytics/utils/plotting.py, cv2 path) using the same OpenCV calls,
 * font (Hershey Simplex), palette and sizes. Draws on a transparent frame-sized layer that is
 * shown over the live preview, so the video itself stays smooth.
 *
 * Not thread-safe: use from one worker thread. Two bitmaps alternate so the one on screen is
 * never drawn into.
 */
class YoloAnnotator {

    @Volatile
    var classNames: List<String> = emptyList()

    private var canvas: Mat? = null
    private val bitmaps = arrayOfNulls<Bitmap>(2)
    private var nextBitmap = 0

    /** Returns a frame-sized bitmap with the boxes and labels (transparent elsewhere). */
    fun draw(detections: List<YoloDetector.Detection>, frameW: Int, frameH: Int): Bitmap? {
        if (!openCvReady) return null
        val im = frameCanvas(frameW, frameH)
        im.setTo(TRANSPARENT)

        // Annotator(): lw = max(round(sum(im.shape) / 2 * 0.003), 2) with im.shape = (h, w, 3)
        val lw = max(Math.rint((frameH + frameW + 3) / 2.0 * 0.003).toInt(), 2)
        val sf = lw / 3.0
        val tf = max(lw - 1, 1)

        // Results.plot() draws in reverse order, so the most confident box ends up on top.
        for (d in detections.asReversed()) {
            if (d.confidence < YoloDetector.DRAW_THRESHOLD) continue
            val color = colorFor(d.classIndex)
            val txtColor = textColorFor(d.classIndex)
            var x1 = (d.x * frameW).toInt()
            val y1 = (d.y * frameH).toInt()
            val x2 = ((d.x + d.w) * frameW).toInt()
            val y2 = ((d.y + d.h) * frameH).toInt()
            Imgproc.rectangle(im, Point(x1.toDouble(), y1.toDouble()), Point(x2.toDouble(), y2.toDouble()), color, lw, Imgproc.LINE_AA)

            val name = classNames.getOrNull(d.classIndex) ?: d.classIndex.toString()
            val label = "$name ${String.format(Locale.US, "%.2f", d.confidence)}"
            val size = Imgproc.getTextSize(label, Imgproc.FONT_HERSHEY_SIMPLEX, sf, tf, IntArray(1))
            val w = size.width.toInt()
            val h = size.height.toInt() + 3 // add pixels to pad text
            val outside = y1 >= h // label fits outside box
            if (x1 > frameW - w) x1 = frameW - w // label would pass the right edge of the image
            val p2y = if (outside) y1 - h else y1 + h
            Imgproc.rectangle(im, Point(x1.toDouble(), y1.toDouble()), Point((x1 + w).toDouble(), p2y.toDouble()), color, -1, Imgproc.LINE_AA)
            val textY = if (outside) y1 - 2 else y1 + h - 1
            Imgproc.putText(im, label, Point(x1.toDouble(), textY.toDouble()), Imgproc.FONT_HERSHEY_SIMPLEX, sf, txtColor, tf, Imgproc.LINE_AA)
        }

        val bitmap = frameBitmap(frameW, frameH)
        Utils.matToBitmap(im, bitmap)
        return bitmap
    }

    fun release() {
        canvas?.release()
        canvas = null
    }

    private fun frameCanvas(w: Int, h: Int): Mat {
        val current = canvas
        if (current != null && current.cols() == w && current.rows() == h) return current
        current?.release()
        return Mat(h, w, CvType.CV_8UC4).also { canvas = it }
    }

    private fun frameBitmap(w: Int, h: Int): Bitmap {
        val i = nextBitmap
        nextBitmap = 1 - nextBitmap
        val current = bitmaps[i]
        if (current != null && current.width == w && current.height == h) return current
        return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { bitmaps[i] = it }
    }

    companion object {
        private const val TAG = "YoloAnnotator"

        private val openCvReady: Boolean by lazy {
            val ok = OpenCVLoader.initLocal()
            if (!ok) Log.e(TAG, "OpenCV failed to load; boxes will not be drawn")
            ok
        }

        private val TRANSPARENT = Scalar(0.0, 0.0, 0.0, 0.0)

        // Colors.hexs, indexed by class id (mod 20)
        private val PALETTE = listOf(
            "042AFF", "0BDBEB", "F3F3F3", "00DFB7", "111F68", "FF6FDD", "FF444F", "CCED00", "00F344", "BD00FF",
            "00B4FF", "DD00BA", "00FFFF", "26C000", "01FFB3", "7D24FF", "7B0068", "FF1B6C", "FC6D2F", "A2FF0B",
        )

        // Annotator.dark_colors (given there in BGR), here in RGB: these get dark text.
        private val DARK_TEXT_BACKGROUNDS = setOf(
            "0BDBEB", "F3F3F3", "00DFB7", "FF6FDD", "CCED00", "00F344", "00FFFF", "01FFB3", "A2FF0B",
        )
        private val DARK_TEXT = rgba("111F68") // (104, 31, 17) in BGR
        private val WHITE_TEXT = Scalar(255.0, 255.0, 255.0, 255.0)

        private fun rgba(hex: String): Scalar {
            val v = hex.toInt(16)
            return Scalar(((v shr 16) and 0xFF).toDouble(), ((v shr 8) and 0xFF).toDouble(), (v and 0xFF).toDouble(), 255.0)
        }

        private val COLORS = PALETTE.map { rgba(it) }
        private val TEXT_COLORS = PALETTE.map { if (it in DARK_TEXT_BACKGROUNDS) DARK_TEXT else WHITE_TEXT }

        private fun colorFor(classIndex: Int) = COLORS[classIndex % COLORS.size]
        private fun textColorFor(classIndex: Int) = TEXT_COLORS[classIndex % TEXT_COLORS.size]
    }
}
