package com.winsoftprintstation

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/** Renders application-private PDFs to images for React Native preview. */
class ReceiptPdfPreviewModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "ReceiptPdfPreview"

  @ReactMethod
  fun renderPdf(filePath: String, promise: Promise) {
    try {
      val pdfFile = File(filePath)
      if (!pdfFile.isFile) {
        throw IllegalArgumentException("Generated PDF was not found.")
      }

      val outputDirectory = File(context.cacheDir, "receipt-pdf-previews").apply { mkdirs() }
      val pageUris = Arguments.createArray()
      ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          for (index in 0 until renderer.pageCount) {
            renderer.openPage(index).use { page ->
              val scale = minOf(2f, 1440f / page.width.toFloat())
              val bitmap = Bitmap.createBitmap(
                (page.width * scale).toInt(),
                (page.height * scale).toInt(),
                Bitmap.Config.ARGB_8888,
              )
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val imageFile = File(outputDirectory, "${pdfFile.nameWithoutExtension}_page_${index + 1}.png")
              FileOutputStream(imageFile).use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
              }
              bitmap.recycle()
              pageUris.pushString(Uri.fromFile(imageFile).toString())
            }
          }
        }
      }
      promise.resolve(pageUris)
    } catch (error: Exception) {
      promise.reject("PDF_PREVIEW_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openPdf(filePath: String, promise: Promise) {
    try {
      val pdfFile = File(filePath)
      if (!pdfFile.isFile) {
        throw IllegalArgumentException("Generated PDF was not found.")
      }
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", pdfFile)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/pdf")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.currentActivity?.startActivity(Intent.createChooser(intent, "Open receipt PDF"))
        ?: context.startActivity(Intent.createChooser(intent, "Open receipt PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("PDF_OPEN_FAILED", error.message, error)
    }
  }
}
