package com.uvccamera

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class CameraErrorEvent(
    surfaceId: Int,
    viewId: Int,
    private val errorCode: Int,
    private val errorMessage: String
) : Event<CameraErrorEvent>(surfaceId, viewId) {

    override fun getEventName(): String {
        return "onCameraError"
    }

    override fun getEventData(): WritableMap {
        val event = Arguments.createMap()
        event.putInt("code", errorCode)
        event.putString("message", errorMessage)
        return event
    }

    companion object {
        // Error codes
        const val ERROR_CAMERA_OPEN_FAILED = 1
        const val ERROR_CAMERA_DISCONNECTED = 2
        const val ERROR_CAPTURE_FAILED = 3
        const val ERROR_PERMISSION_DENIED = 4
        const val ERROR_NO_DEVICE_FOUND = 5
        const val ERROR_DETECTOR_FAILED = 6
    }
}
