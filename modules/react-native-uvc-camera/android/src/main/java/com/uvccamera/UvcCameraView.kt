package com.uvccamera

import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.usb.UsbDevice
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AttributeSet
import android.util.Log
import android.view.Gravity
import android.view.TextureView
import android.widget.FrameLayout
import android.widget.ImageView
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.herohan.uvcapp.CameraHelper
import com.herohan.uvcapp.ICameraHelper
import com.herohan.uvcapp.IImageCapture
import com.herohan.uvcapp.IImageCapture.OnImageCaptureCallback
import com.serenegiant.usb.IFrameCallback
import com.serenegiant.usb.Size
import com.serenegiant.usb.UVCCamera
import com.serenegiant.widget.AspectRatioTextureView
import com.uvccamera.utils.SaveHelper
import java.io.File
import java.lang.ref.WeakReference
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class UvcCameraView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    private val DEFAULT_WIDTH: Int = 640
    private val DEFAULT_HEIGHT: Int = 480

    private lateinit var cameraViewMain: AspectRatioTextureView

    // Boxes drawn like Ultralytics results.plot(), layered over the preview
    private lateinit var detectionOverlay: ImageView
    private val annotator = YoloAnnotator()

    // Thread-safe camera helper access
    @Volatile
    private var cameraHelper: ICameraHelper? = null
    private val cameraLock = Any()

    private var mPreviewWidth = DEFAULT_WIDTH
    private var mPreviewHeight = DEFAULT_HEIGHT

    // Track current device for events
    private var currentDevice: UsbDevice? = null

    // Handler for main thread operations
    private val mainHandler = Handler(Looper.getMainLooper())

    // Flag to track if view is attached
    @Volatile
    private var isViewAttached = false

    // --- Live hazard detection ---
    @Volatile
    private var detectionEnabled = false

    // Size of the frames delivered by the frame callback (= preview size)
    @Volatile
    private var frameWidth = DEFAULT_WIDTH

    @Volatile
    private var frameHeight = DEFAULT_HEIGHT

    // True while a frame is being analysed; frames arriving meanwhile are skipped
    private val detectorBusy = AtomicBoolean(false)
    private var detectorExecutor: ExecutorService? = null
    private var frameBytes = ByteArray(0)
    private val frameCallback = FrameCallbackImpl(this)

    companion object {
        private const val TAG = "UvcCameraView"
        private const val DEBUG = true
    }

    init {
        setupView()
    }

    private fun setupView() {
        cameraViewMain = AspectRatioTextureView(context).apply {
            setAspectRatio(mPreviewWidth, mPreviewHeight)
        }

        val params = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        params.gravity = Gravity.CENTER
        addView(cameraViewMain, params)

        // Frame-sized drawing with the frame's aspect ratio: FIT_CENTER lands it exactly on the preview.
        detectionOverlay = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        addView(detectionOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT, Gravity.CENTER))

        // Use a static inner class pattern to avoid implicit this reference
        cameraViewMain.surfaceTextureListener = SurfaceTextureListenerImpl(this)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isViewAttached = true
        initCameraHelper()
    }

    override fun onDetachedFromWindow() {
        isViewAttached = false
        clearCameraHelper()
        detectorExecutor?.shutdown()
        detectorExecutor = null
        detectionOverlay.setImageDrawable(null)
        super.onDetachedFromWindow()
    }

    // React Native (Fabric) doesn't lay out views added natively, so the preview
    // would keep its first size after setAspectRatio(). Measure and lay out ourselves.
    // (A lambda, not a property: requestLayout() already runs from the constructor via addView.)
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

    fun setDetectionEnabled(enabled: Boolean) {
        if (detectionEnabled == enabled) return
        detectionEnabled = enabled
        applyFrameCallback()
        if (!enabled) mainHandler.post { detectionOverlay.setImageDrawable(null) }
    }

    fun setClassNames(names: List<String>) {
        annotator.classNames = names
    }

    private fun applyFrameCallback() {
        synchronized(cameraLock) {
            val helper = cameraHelper ?: return
            if (!helper.isCameraOpened) return
            // RGB = 3 bytes per pixel, the layout YoloDetector expects
            helper.setFrameCallback(if (detectionEnabled) frameCallback else null, UVCCamera.PIXEL_FORMAT_RGB)
        }
    }

    private class FrameCallbackImpl(view: UvcCameraView) : IFrameCallback {
        private val viewRef = WeakReference(view)

        override fun onFrame(frame: ByteBuffer?) {
            val view = viewRef.get() ?: return
            if (frame != null) view.onFrame(frame)
        }
    }

    // Runs on the camera's frame thread: copy the frame (its buffer is reused) and analyse it on our worker.
    private fun onFrame(frame: ByteBuffer) {
        if (!detectionEnabled || !isViewAttached) return
        if (!detectorBusy.compareAndSet(false, true)) return

        val frameW = frameWidth
        val frameH = frameHeight
        val size = frame.remaining()
        if (size != frameW * frameH * 3) {
            if (DEBUG) Log.w(TAG, "Unexpected frame size $size for ${frameW}x$frameH")
            detectorBusy.set(false)
            return
        }

        val executor = detectorExecutor ?: Executors.newSingleThreadExecutor().also { detectorExecutor = it }
        if (frameBytes.size != size) frameBytes = ByteArray(size)
        frame.get(frameBytes)
        val pixels = frameBytes

        try {
            executor.execute {
                try {
                    runDetection(pixels, frameW, frameH)
                } finally {
                    detectorBusy.set(false)
                }
            }
        } catch (e: Exception) {
            detectorBusy.set(false)
        }
    }

    private fun runDetection(pixels: ByteArray, frameW: Int, frameH: Int) {
        val detector = try {
            YoloDetector.get(context)
        } catch (e: Throwable) {
            Log.e(TAG, "Could not load detection model", e)
            detectionEnabled = false
            sendErrorEvent(CameraErrorEvent.ERROR_DETECTOR_FAILED, "Could not load detection model: ${e.message}")
            return
        }

        val start = SystemClock.elapsedRealtime()
        val detections = detector.detect(pixels, frameW, frameH, 3)
        val inferenceMs = (SystemClock.elapsedRealtime() - start).toDouble()

        val drawn = annotator.draw(detections, frameW, frameH)
        mainHandler.post {
            if (detectionEnabled && isViewAttached) detectionOverlay.setImageBitmap(drawn)
        }

        // The preview keeps the camera's aspect ratio inside this view, so map frame
        // coordinates onto the area the preview actually covers.
        val viewW = width.toFloat()
        val viewH = height.toFloat()
        if (viewW <= 0f || viewH <= 0f) return
        val json = YoloDetector.toJson(
            detections,
            offsetX = cameraViewMain.left / viewW,
            offsetY = cameraViewMain.top / viewH,
            scaleX = cameraViewMain.width / viewW,
            scaleY = cameraViewMain.height / viewH
        )
        sendDetectionsEvent(json, inferenceMs, detector.delegateName)
    }

    private fun clearCameraHelper() {
        synchronized(cameraLock) {
            cameraHelper?.let { helper ->
                // Remove callbacks before releasing to prevent memory leaks
                helper.setStateCallback(null)
                if (helper.isCameraOpened) helper.setFrameCallback(null, UVCCamera.PIXEL_FORMAT_RGB)
                helper.release()
            }
            cameraHelper = null
            currentDevice = null
        }
    }

    private fun initCameraHelper() {
        synchronized(cameraLock) {
            if (cameraHelper == null) {
                cameraHelper = CameraHelper().apply {
                    setStateCallback(StateCallbackImpl(this@UvcCameraView))
                }
            }

            // Pick first device automatically
            val deviceList = cameraHelper?.deviceList
            if (deviceList.isNullOrEmpty()) {
                if (DEBUG) Log.d(TAG, "No UVC devices found")
                sendErrorEvent(
                    CameraErrorEvent.ERROR_NO_DEVICE_FOUND,
                    "No UVC camera devices found"
                )
            } else {
                deviceList.firstOrNull()?.let { device ->
                    if (DEBUG) Log.d(TAG, "Found device: ${device.deviceName}")
                    cameraHelper?.selectDevice(device)
                }
            }
        }
    }

    /**
     * Static inner class to avoid implicit reference to outer class
     * Uses WeakReference to prevent memory leaks
     */
    private class StateCallbackImpl(view: UvcCameraView) : ICameraHelper.StateCallback {
        private val viewRef = WeakReference(view)

        override fun onAttach(device: UsbDevice?) {
            viewRef.get()?.let { view ->
                if (!view.isViewAttached) return
                device?.let {
                    synchronized(view.cameraLock) {
                        view.cameraHelper?.selectDevice(it)
                    }
                }
            }
        }

        override fun onDeviceOpen(device: UsbDevice?, isFirstOpen: Boolean) {
            viewRef.get()?.let { view ->
                if (!view.isViewAttached) return
                synchronized(view.cameraLock) {
                    view.cameraHelper?.openCamera()
                }
            }
        }

        override fun onCameraOpen(device: UsbDevice?) {
            viewRef.get()?.let { view ->
                if (!view.isViewAttached) return
                view.currentDevice = device
                view.handleCameraOpen()
                device?.let { view.sendCameraReadyEvent(it) }
            }
        }

        override fun onCameraClose(device: UsbDevice?) {
            viewRef.get()?.let { view ->
                view.cameraViewMain.surfaceTexture?.let { texture ->
                    synchronized(view.cameraLock) {
                        view.cameraHelper?.removeSurface(texture)
                    }
                }
            }
        }

        override fun onDeviceClose(device: UsbDevice?) {
            // Device closed normally
        }

        override fun onDetach(device: UsbDevice?) {
            viewRef.get()?.let { view ->
                if (DEBUG) Log.d(TAG, "Device detached: ${device?.deviceName}")
                view.currentDevice = null
                view.sendDeviceDisconnectedEvent()
            }
        }

        override fun onCancel(device: UsbDevice?) {
            viewRef.get()?.let { view ->
                if (DEBUG) Log.d(TAG, "Device cancelled/permission denied: ${device?.deviceName}")
                view.sendErrorEvent(
                    CameraErrorEvent.ERROR_PERMISSION_DENIED,
                    "USB permission denied for device: ${device?.deviceName}"
                )
            }
        }
    }

    /**
     * Static inner class for SurfaceTextureListener to avoid memory leaks
     */
    private class SurfaceTextureListenerImpl(view: UvcCameraView) : TextureView.SurfaceTextureListener {
        private val viewRef = WeakReference(view)

        override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
            viewRef.get()?.let { view ->
                synchronized(view.cameraLock) {
                    view.cameraHelper?.addSurface(surface, false)
                }
            }
        }

        override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
            // Handle size change if needed
        }

        override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
            viewRef.get()?.let { view ->
                synchronized(view.cameraLock) {
                    view.cameraHelper?.removeSurface(surface)
                }
            }
            return true
        }

        override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
            // Frame update - could be used for frame callbacks in future
        }
    }

    private fun handleCameraOpen() {
        synchronized(cameraLock) {
            cameraHelper?.apply {
                startPreview()

                // Resize Logic
                previewSize?.let { size ->
                    frameWidth = size.width
                    frameHeight = size.height
                    resizePreviewView(size)
                }

                // Attach Surface
                cameraViewMain.surfaceTexture?.let { texture ->
                    addSurface(texture, false)
                }
            }
            applyFrameCallback()
        }
    }

    private fun resizePreviewView(size: Size) {
        mainHandler.post {
            if (!isViewAttached) return@post
            mPreviewWidth = size.width
            mPreviewHeight = size.height
            cameraViewMain.setAspectRatio(mPreviewWidth, mPreviewHeight)
            cameraViewMain.requestLayout()
        }
    }

    // --- EVENT SENDING (Fabric Compatible) ---

    private fun sendEvent(uri: String) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)

            dispatcher?.dispatchEvent(
                PictureTakenEvent(surfaceId, id, uri)
            )
        }
    }

    private fun sendErrorEvent(code: Int, message: String) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)

            dispatcher?.dispatchEvent(
                CameraErrorEvent(surfaceId, id, code, message)
            )
        }
    }

    private fun sendDetectionsEvent(detections: String, inferenceMs: Double, delegate: String) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)

            dispatcher?.dispatchEvent(
                DetectionsEvent(surfaceId, id, detections, inferenceMs, delegate)
            )
        }
    }

    private fun sendCameraReadyEvent(device: UsbDevice) {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)

            dispatcher?.dispatchEvent(
                CameraReadyEvent(
                    surfaceId,
                    id,
                    device.deviceName,
                    device.vendorId,
                    device.productId
                )
            )
        }
    }

    private fun sendDeviceDisconnectedEvent() {
        if (!isViewAttached) return
        mainHandler.post {
            val reactContext = context as? ReactContext ?: return@post
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            val surfaceId = UIManagerHelper.getSurfaceId(reactContext)

            dispatcher?.dispatchEvent(
                DeviceDisconnectedEvent(surfaceId, id)
            )
        }
    }

    fun takePicture() {
        synchronized(cameraLock) {
            if (cameraHelper == null || cameraHelper?.isCameraOpened != true) {
                Log.e(TAG, "Camera is not open")
                sendErrorEvent(
                    CameraErrorEvent.ERROR_CAPTURE_FAILED,
                    "Camera is not open"
                )
                return
            }

            try {
                val path = SaveHelper.getSavePhotoPath(context)
                val file = File(path)
                val options = IImageCapture.OutputFileOptions.Builder(file).build()

                cameraHelper?.takePicture(options, object : OnImageCaptureCallback {
                    override fun onImageSaved(outputFileResults: IImageCapture.OutputFileResults) {
                        if (DEBUG) Log.d(TAG, "Saved: ${file.absolutePath}")
                        val uri = "file://" + file.absolutePath
                        sendEvent(uri)
                    }

                    override fun onError(imageCaptureError: Int, message: String, cause: Throwable?) {
                        Log.e(TAG, "Capture Error: $message", cause)
                        sendErrorEvent(
                            CameraErrorEvent.ERROR_CAPTURE_FAILED,
                            message
                        )
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "File Error: ${e.message}", e)
                sendErrorEvent(
                    CameraErrorEvent.ERROR_CAPTURE_FAILED,
                    "Failed to create output file: ${e.message}"
                )
            }
        }
    }

    /**
     * Check if camera is currently open and ready
     */
    fun isCameraReady(): Boolean {
        synchronized(cameraLock) {
            return cameraHelper?.isCameraOpened == true
        }
    }

    /**
     * Get the current preview resolution
     */
    fun getPreviewSize(): Pair<Int, Int> {
        return Pair(mPreviewWidth, mPreviewHeight)
    }
}
