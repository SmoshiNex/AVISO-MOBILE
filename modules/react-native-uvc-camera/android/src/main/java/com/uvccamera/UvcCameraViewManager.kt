package com.uvccamera

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.viewmanagers.UvcCameraViewManagerInterface
import com.facebook.react.viewmanagers.UvcCameraViewManagerDelegate

@ReactModule(name = UvcCameraViewManager.NAME)
class UvcCameraViewManager : SimpleViewManager<UvcCameraView>(),
    UvcCameraViewManagerInterface<UvcCameraView> {

    private val mDelegate: ViewManagerDelegate<UvcCameraView>

    init {
        mDelegate = UvcCameraViewManagerDelegate(this)
    }

    override fun getDelegate(): ViewManagerDelegate<UvcCameraView> {
        return mDelegate
    }

    override fun getName(): String {
        return NAME
    }

    override fun createViewInstance(context: ThemedReactContext): UvcCameraView {
        return UvcCameraView(context)
    }

    // Register all events for JS
    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onPictureTaken", MapBuilder.of("registrationName", "onPictureTaken"))
            .put("onCameraError", MapBuilder.of("registrationName", "onCameraError"))
            .put("onCameraReady", MapBuilder.of("registrationName", "onCameraReady"))
            .put("onDeviceDisconnected", MapBuilder.of("registrationName", "onDeviceDisconnected"))
            .put("onDetections", MapBuilder.of("registrationName", "onDetections"))
            .build()
            .toMutableMap()
    }

    @ReactProp(name = "detectionEnabled")
    override fun setDetectionEnabled(view: UvcCameraView?, value: Boolean) {
        view?.setDetectionEnabled(value)
    }

    @ReactProp(name = "classNames")
    override fun setClassNames(view: UvcCameraView?, value: ReadableArray?) {
        view?.setClassNames(value.toNames())
    }

    // Handle Commands (New Architecture)
    override fun receiveCommand(root: UvcCameraView, commandId: String, args: ReadableArray?) {
        when (commandId) {
            "takePicture" -> root.takePicture()
            else -> super.receiveCommand(root, commandId, args)
        }
    }

    // Required by Interface (Codegen)
    override fun takePicture(view: UvcCameraView?) {
        view?.takePicture()
    }

    companion object {
        const val NAME = "UvcCameraView"
    }
}
