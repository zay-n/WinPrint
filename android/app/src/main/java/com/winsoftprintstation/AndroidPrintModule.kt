package com.winsoftprintstation

import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Native Android module to feed generated A4 receipt PDFs to the Android Print Framework.
 */
class AndroidPrintModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "AndroidPrint"

  @ReactMethod
  fun printPdf(filePath: String, jobName: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Cannot launch print dialog without an active window.")
      return
    }

    val file = File(filePath)
    if (!file.exists() || !file.isFile) {
      promise.reject("FILE_NOT_FOUND", "PDF file not found at $filePath")
      return
    }

    try {
      activity.runOnUiThread {
        try {
          val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
          if (printManager == null) {
            promise.reject("PRINT_SERVICE_UNAVAILABLE", "System PrintManager is not available on this device.")
            return@runOnUiThread
          }

          val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
              oldAttributes: PrintAttributes?,
              newAttributes: PrintAttributes?,
              cancellationSignal: CancellationSignal?,
              callback: LayoutResultCallback?,
              extras: Bundle?
            ) {
              if (cancellationSignal?.isCanceled == true) {
                callback?.onLayoutCancelled()
                return
              }
              val info = PrintDocumentInfo.Builder(file.name)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                .build()
              callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
              pages: Array<out PageRange>?,
              destination: ParcelFileDescriptor?,
              cancellationSignal: CancellationSignal?,
              callback: WriteResultCallback?
            ) {
              if (destination == null) {
                callback?.onWriteFailed("Destination file descriptor is null")
                return
              }
              try {
                FileInputStream(file).use { input ->
                  FileOutputStream(destination.fileDescriptor).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } >= 0) {
                      if (cancellationSignal?.isCanceled == true) {
                        callback?.onWriteCancelled()
                        return
                      }
                      output.write(buffer, 0, bytesRead)
                    }
                  }
                }
                callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
              } catch (e: Exception) {
                callback?.onWriteFailed(e.message)
              }
            }
          }

          val printAttributes = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .build()

          val safeJobName = if (jobName.isNotBlank()) jobName else "Winsoft Print Station Document"
          printManager.print(safeJobName, adapter, printAttributes)
          promise.resolve(true)
        } catch (e: Exception) {
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    } catch (e: Exception) {
      promise.reject("PRINT_DISPATCH_FAILED", e.message, e)
    }
  }
}
