package com.uvccamera

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class DetectionsEvent(
  surfaceId: Int,
  viewId: Int,
  private val detections: String,
  private val inferenceMs: Double,
  private val delegate: String
) : Event<DetectionsEvent>(surfaceId, viewId) {

  override fun getEventName(): String {
    return "onDetections"
  }

  // Frames arrive faster than JS may handle them; only the newest set matters.
  override fun canCoalesce(): Boolean {
    return true
  }

  override fun getEventData(): WritableMap {
    val event = Arguments.createMap()
    event.putString("detections", detections)
    event.putDouble("inferenceMs", inferenceMs)
    event.putString("delegate", delegate)
    return event
  }
}
