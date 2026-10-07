package com.uvccamera

import com.facebook.react.bridge.ReadableArray

/** The classNames prop as a Kotlin list (empty when not set). */
internal fun ReadableArray?.toNames(): List<String> {
  if (this == null) return emptyList()
  return List(size()) { getString(it) ?: "" }
}
