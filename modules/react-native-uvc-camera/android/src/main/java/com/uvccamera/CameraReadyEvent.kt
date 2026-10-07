package com.uvccamera

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class CameraReadyEvent(
    surfaceId: Int,
    viewId: Int,
    private val deviceName: String,
    private val vendorId: Int,
    private val productId: Int
) : Event<CameraReadyEvent>(surfaceId, viewId) {

    override fun getEventName(): String {
        return "onCameraReady"
    }

    override fun getEventData(): WritableMap {
        val event = Arguments.createMap()
        event.putString("deviceName", deviceName)
        event.putInt("vendorId", vendorId)
        event.putInt("productId", productId)
        return event
    }
}
