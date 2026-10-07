package com.uvccamera.utils

import android.content.Context
import android.os.Environment
import java.io.File
import java.util.Date

object SaveHelper {

  // 1. We remove the old "Environment.getExternalStorageDirectory()" logic
  // 2. We accept 'context' to find the safe App-Specific folder

  fun getSavePhotoPath(context: Context): String {
    // This gets: /storage/emulated/0/Android/data/com.your.package/files/Pictures
    // No permissions needed to write here.
    val dir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)

    if (dir != null && !dir.exists()) {
      dir.mkdirs()
    }

    val fileName = TimeFormatter.format_yyyy_MM_dd_HH_mm_ss(Date()) + ".jpg"
    return File(dir, fileName).absolutePath
  }

  fun getSaveVideoPath(context: Context): String {
    val dir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)

    if (dir != null && !dir.exists()) {
      dir.mkdirs()
    }

    val fileName = TimeFormatter.format_yyyy_MM_dd_HH_mm_ss(Date()) + ".mp4"
    return File(dir, fileName).absolutePath
  }
}
