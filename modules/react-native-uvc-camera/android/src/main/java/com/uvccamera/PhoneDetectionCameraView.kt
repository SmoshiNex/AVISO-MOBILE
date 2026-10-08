package com.uvccamera

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max

/**
 * The phone's back camera with the same live hazard detection as UvcCameraView.
 * Preview and analysis both use 4:3 so they see the same field of view; the
 * preview fills the view (center crop) and boxes are mapped through that crop.
 */
class PhoneDetectionCameraView(context: Context) : FrameLayout(context) {

    private val previewView = PreviewView(context).apply {
        // TextureView-backed, so React Native overlays draw on top reliably
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    }

    // Boxes drawn like Ultralytics results.plot(). The analysed frame has the same 4:3 view as the
    // preview, so CENTER_CROP crops it exactly like the preview's FILL_CENTER.
    private val detectionOverlay = ImageView(context).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
    private val annotator = YoloAnnotator()

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var detectionEnabled = false

    @Volatile
    private var isViewAttached = false

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var analysis: ImageAnalysis? = null
    private var analysisExecutor: ExecutorService? = null
    private var frameBytes = ByteArray(0)

    init {
        addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))
        addView(detectionOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))
    }

    fun setDetectionEnabled(enabled: Boolean) {
        detectionEnabled = enabled
        if (!enabled) mainHandler.post { detectionOverlay.setImageDrawable(null) }
    }

    fun setClassNames(names: List<String>) {
        annotator.classNames = names
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isViewAttached = true
        startCamera()
    }

    override fun onDetachedFromWindow() {
        isViewAttached = false
        stopCamera()
        detectionOverlay.setImageDrawable(null)
        super.onDetachedFromWindow()
    }

    // React Native (Fabric) doesn't lay out views added natively; do it ourselves.
    override fun requestLayout() {
        super.requestLayout()
        post {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
            )
            layout(left, top, right, bottom)
        }
    }

    private fun startCamera() {
        val owner = (context as? ReactContext)?.currentActivity as? LifecycleOwner
        if (owner == null) {
            sendErrorEvent(CameraErrorEvent.ERROR_CAMERA_OPEN_FAILED, "Phone camera needs an active screen")
            return
        }

        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (!isViewAttached) return@addListener
            try {
                val provider = future.get()
                val resolution = ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .build()
                val newPreview = Preview.Builder()
                    .setResolutionSelector(resolution)
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }

                val executor = Executors.newSingleThreadExecutor()
                val newAnalysis = ImageAnalysis.Builder()
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                            .setResolutionStrategy(
                                ResolutionStrategy(
                                    Size(640, 480),
                                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                                )
                            )
                            .build()
                    )
                    // Analysis runs one frame at a time; frames arriving meanwhile are dropped
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    // Frames come upright for the current screen orientation
                    .setOutputImageRotationEnabled(true)
                    .build()
                    .also { it.setAnalyzer(executor) { image -> analyze(image) } }

                provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, newPreview, newAnalysis)

                cameraProvider = provider
                preview = newPreview
                analysis = newAnalysis
                analysisExecutor = executor
            } catch (e: Exception) {
                Log.e(TAG, "Could not start phone camera", e)
                sendErrorEvent(CameraErrorEvent.ERROR_CAMERA_OPEN_FAILED, "Could not start phone camera: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun stopCamera() {
        analysis?.clearAnalyzer()
        val provider = cameraProvider
        val p = preview
        val a = analysis
        if (provider != null && p != null && a != null) provider.unbind(p, a)
        cameraProvider = null
        preview = null
        analysis = null
        analysisExecutor?.shutdown()
        analysisExecutor = null
    }

    private fun analyze(image: ImageProxy) {
        try {
            if (!detectionEnabled || !isViewAttached) return

            val plane = image.planes[0]
            val buffer = plane.buffer
            val size = buffer.remaining()
            if (frameBytes.size != size) frameBytes = ByteArray(size)
            buffer.get(frameBytes)
            val frameW = image.width
            val frameH = image.height
            val rowStride = plane.rowStride

            val detector = try {
                YoloDetector.get(context)
            } catch (e: Throwable) {
                Log.e(TAG, "Could not load detection model", e)
                detectionEnabled = false
                sendErrorEvent(CameraErrorEvent.ERROR_DETECTOR_FAILED, "Could not load detection model: ${e.message}")
                return
            }

            val start = SystemClock.elapsedRealtime()
            val detections = detector.detect(frameBytes, frameW, frameH, 4, rowStride)
            val timings = detector.lastTimings
            val inferenceMs = (SystemClock.elapsedRealtime() - start).toDouble()

            val drawn = annotator.draw(detections, frameW, frameH)
            mainHandler.post {
                if (detectionEnabled && isViewAttached) detectionOverlay.setImageBitmap(drawn)
            }

            // FILL_CENTER: the frame is scaled to cover the view and the overflow is cropped.
            val viewW = width.toFloat()
            val viewH = height.toFloat()
            if (viewW <= 0f || viewH <= 0f) return
            val scale = max(viewW / frameW, viewH / frameH)
            val shownW = frameW * scale
            val shownH = frameH * scale
            val json = YoloDetector.toJson(
                detections,
                offsetX = (viewW - shownW) / 2f / viewW,
                offsetY = (viewH - shownH) / 2f / viewH,
                scaleX = shownW / viewW,
                scaleY = shownH / viewH
            )
            sendDetectionsEvent(json, inferenceMs, detector.delegateName, timings, frameW, frameH)
        } catch (e: Exception) {
            Log.e(TAG, "Frame analysis failed", e)
        } finally {
            image.close()
        }
    }

    private fun sendDetectionsEvent(
        detections: String,
        inferenceMs: Double,
        delegate: String,
        timings: YoloDetector.Timings,
        frameW: Int,
        frameH: Int,
    ) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
            dispatcher?.dispatchEvent(DetectionsEvent(surfaceId, id, detections, inferenceMs, delegate, timings, frameW, frameH))
        }
    }

    private fun sendErrorEvent(code: Int, message: String) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
            dispatcher?.dispatchEvent(CameraErrorEvent(surfaceId, id, code, message))
        }
    }

    companion object {
        private const val TAG = "PhoneDetectionCamera"
    }
}
