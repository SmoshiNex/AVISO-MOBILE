package com.uvccamera.utils

import java.text.MessageFormat
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.SimpleTimeZone
import java.util.TimeZone

object TimeFormatter {
  val yyyy_MM_dd: SimpleDateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
  val yyyy_MM_ddHH_mm: SimpleDateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
  val yyyy_MM_ddHH_mm_ss: SimpleDateFormat =
    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
  val yyyy_MM_dd_HH_mm_ss: SimpleDateFormat =
    SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.getDefault())
  val yyyyMMdd: SimpleDateFormat = SimpleDateFormat("yyyyMMdd", Locale.getDefault())
  val yyyyMMddHHmmss: SimpleDateFormat = SimpleDateFormat("yyyyMMddHHmmss", Locale.getDefault())

  val yyyy_M_d_cn: SimpleDateFormat = SimpleDateFormat("yyyy年M月d日", Locale.getDefault())
  val yyyy_M_d_HH_mm_cn: SimpleDateFormat =
    SimpleDateFormat("yyyy年M月d日 HH:mm", Locale.getDefault())

  fun format_yyyy_MM_dd(time: Long): String {
    return format_yyyy_MM_dd(Date(time))
  }

  fun format_yyyy_MM_dd(date: Date?): String {
    return yyyy_MM_dd.format(date)
  }

  fun format_yyyy_MM_dd(calendar: Calendar): String {
    return format_yyyy_MM_dd(calendar.getTime())
  }

  fun format_yyyy_MM_dd_HH_mm(time: Long): String {
    return format_yyyy_MM_dd_HH_mm(Date(time))
  }

  fun format_yyyy_MM_dd_HH_mm(date: Date?): String {
    return yyyy_MM_ddHH_mm.format(date)
  }

  fun format_yyyy_MM_dd_HH_mm(calendar: Calendar): String {
    return format_yyyy_MM_dd_HH_mm(calendar.getTime())
  }

  fun format_yyyy_MM_ddHH_mm_ss(time: Long): String {
    return format_yyyy_MM_ddHH_mm_ss(Date(time))
  }

  fun format_yyyy_MM_ddHH_mm_ss(date: Date?): String {
    return yyyy_MM_ddHH_mm_ss.format(date)
  }

  fun format_yyyy_MM_ddHH_mm_ss(calendar: Calendar): String {
    return format_yyyy_MM_ddHH_mm_ss(calendar.getTime())
  }

  fun format_yyyy_MM_dd_HH_mm_ss(time: Long): String {
    return format_yyyy_MM_dd_HH_mm_ss(Date(time))
  }

  fun format_yyyy_MM_dd_HH_mm_ss(date: Date?): String {
    return yyyy_MM_dd_HH_mm_ss.format(date)
  }

  fun format_yyyy_MM_dd_HH_mm_ss(calendar: Calendar): String {
    return format_yyyy_MM_dd_HH_mm_ss(calendar.getTime())
  }

  fun format_yyyyMMdd(time: Long): String {
    return format_yyyyMMdd(Date(time))
  }

  fun format_yyyyMMdd(date: Date?): String {
    return yyyyMMdd.format(date)
  }

  fun format_yyyyMMdd(calendar: Calendar): String {
    return format_yyyyMMdd(calendar.getTime())
  }

  fun format_yyyyMMddHHmmss(time: Long): String {
    return format_yyyyMMddHHmmss(Date(time))
  }

  fun format_yyyyMMddHHmmss(date: Date?): String {
    return yyyyMMddHHmmss.format(date)
  }

  fun getTimeFormatValue(time: Long): String {
    return MessageFormat.format("{0,number,00}:{1,number,00}", time / 60, time % 60)
  }

  fun getHHMMSSFormatValue(time: Int): String {
    val t = (time / 1000).toLong()
    return MessageFormat.format(
      "{0,number,00}:{1,number,00}:{2,number,00}",
      (t / 60) / 60,
      (t / 60) % 60,
      t % 60
    )
  }

  fun getFormattedDateString(timeZoneOffset: Int): String {
    var timeZoneOffset = timeZoneOffset
    val timeZone: TimeZone?
    if (timeZoneOffset > 13 || timeZoneOffset < -12) {
      timeZoneOffset = 0
    }
    val ids = TimeZone.getAvailableIDs(timeZoneOffset * 60 * 60 * 1000)
    if (ids.size == 0) {
      timeZone = TimeZone.getDefault()
    } else {
      timeZone = SimpleTimeZone(timeZoneOffset * 60 * 60 * 1000, ids[0])
    }
    val sdf = yyyy_MM_ddHH_mm_ss
    sdf.setTimeZone(timeZone)
    return sdf.format(Date())
  }

  fun getDateTime(date: String?, simpleDateFormat: SimpleDateFormat?, type: DateType): String? {
    var result: String? = null
    if (date == null || date.isEmpty() || simpleDateFormat == null) {
      return null
    }
    var newDate: Date? = null
    try {
      newDate = simpleDateFormat.parse(date)
    } catch (e: ParseException) {
      e.printStackTrace()
    }
    if (newDate != null) {
      when (type) {
        DateType.YEAR -> result = (newDate.getYear() + 1900).toString()
        DateType.MONTH -> result = (newDate.getMonth() + 1).toString()
        DateType.DAY -> result = newDate.getDate().toString()
        DateType.HOUR -> result = newDate.getHours().toString()
        DateType.MIN -> result = newDate.getMinutes().toString()
        DateType.SEC -> result = newDate.getSeconds().toString()
        DateType.TIME -> result =
          getInt2TwoByte(newDate.getHours()) + ":" + getInt2TwoByte(newDate.getMinutes()) + ":" + getInt2TwoByte(
            newDate.getSeconds()
          )

        else -> {}
      }
    }
    return result
  }

  fun getTime_mm_ss(ms: Long): String {
    val formatter = SimpleDateFormat("mm:ss")
    formatter.setTimeZone(TimeZone.getTimeZone("GMT+00:00"))
    return formatter.format(ms)
  }

  fun getFormattedDateTime(format: SimpleDateFormat?, dateTime: Long): String? {
    if (format == null || dateTime < 0) {
      return null
    }
    return format.format(Date(dateTime))
  }

  private fun getInt2TwoByte(num: Int): String {
    val str = num.toString()
    if (num < 10) {
      return "0" + num
    }
    return str
  }

  enum class DateType {
    YEAR,
    MONTH,
    DAY,
    HOUR,
    MIN,
    SEC,
    TIME
  }
}
