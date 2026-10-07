package com.uvccamera

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

class UvcCameraPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == UvcCameraModule.NAME) {
      UvcCameraModule(reactContext)
    } else {
      null
    }
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    val viewManagers: MutableList<ViewManager<*, *>> = ArrayList()
    viewManagers.add(UvcCameraViewManager())
    viewManagers.add(PhoneDetectionCameraViewManager())
    return viewManagers
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      moduleInfos[UvcCameraModule.NAME] = ReactModuleInfo(
        UvcCameraModule.NAME,
        UvcCameraModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        true // isTurboModule
      )
      moduleInfos
    }
  }
}
