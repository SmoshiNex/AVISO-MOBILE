package com.uvccamera

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class DeviceDisconnectedEvent(
    surfaceId: Int,
    viewId: Int
) : Event<DeviceDisconnectedEvent>(surfaceId, viewId) {

    override fun getEventName(): String {
        return "onDeviceDisconnected"
    }

    override fun getEventData(): WritableMap {
        return Arguments.createMap()
    }
}
