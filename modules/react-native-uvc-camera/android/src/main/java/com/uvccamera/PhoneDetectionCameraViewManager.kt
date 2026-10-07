package com.uvccamera

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.PhoneDetectionCameraViewManagerDelegate
import com.facebook.react.viewmanagers.PhoneDetectionCameraViewManagerInterface

@ReactModule(name = PhoneDetectionCameraViewManager.NAME)
class PhoneDetectionCameraViewManager : SimpleViewManager<PhoneDetectionCameraView>(),
    PhoneDetectionCameraViewManagerInterface<PhoneDetectionCameraView> {

    private val mDelegate: ViewManagerDelegate<PhoneDetectionCameraView> =
        PhoneDetectionCameraViewManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<PhoneDetectionCameraView> = mDelegate

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): PhoneDetectionCameraView {
        return PhoneDetectionCameraView(context)
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onDetections", MapBuilder.of("registrationName", "onDetections"))
            .put("onCameraError", MapBuilder.of("registrationName", "onCameraError"))
            .build()
            .toMutableMap()
    }

    @ReactProp(name = "detectionEnabled")
    override fun setDetectionEnabled(view: PhoneDetectionCameraView?, value: Boolean) {
        view?.setDetectionEnabled(value)
    }

    @ReactProp(name = "classNames")
    override fun setClassNames(view: PhoneDetectionCameraView?, value: ReadableArray?) {
        view?.setClassNames(value.toNames())
    }

    companion object {
        const val NAME = "PhoneDetectionCameraView"
    }
}
