package com.uvccamera

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.ExecutionException

@ReactModule(name = UvcCameraModule.NAME)
class UvcCameraModule(reactContext: ReactApplicationContext) :
  NativeUvcCameraSpec(reactContext) {

  override fun getName(): String {
    return NAME
  }

  // Example method
  // See https://reactnative.dev/docs/native-modules-android
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  /**
   * Loads the detection model in the background so detection is ready before the first frame.
   * Resolves with "GPU" or "CPU" once ready; rejects if the model can't be loaded.
   */
  override fun prepareDetector(promise: Promise) {
    val future = YoloDetector.prepare(reactApplicationContext)
    Thread({
      try {
        promise.resolve(future.get().delegateName)
      } catch (e: ExecutionException) {
        promise.reject("DETECTOR_FAILED", e.cause?.message ?: "Could not load detection model", e.cause)
      } catch (e: Exception) {
        promise.reject("DETECTOR_FAILED", e.message ?: "Could not load detection model", e)
      }
    }, "yolo-prepare-wait").start()
  }

  companion object {
    const val NAME = "UvcCamera"
  }
}
