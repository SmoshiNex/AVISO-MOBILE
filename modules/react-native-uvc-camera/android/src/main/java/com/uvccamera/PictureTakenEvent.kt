package com.uvccamera

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class PictureTakenEvent(
  surfaceId: Int,
  viewId: Int,
  private val uri: String
) : Event<PictureTakenEvent>(surfaceId, viewId) {

  // 1. The name must match what you defined in the Manager ("onPictureTaken")
  override fun getEventName(): String {
    return "onPictureTaken"
  }

  // 2. The data to send to JS
  override fun getEventData(): WritableMap {
    val event = Arguments.createMap()
    event.putString("uri", uri)
    return event
  }
}
