package com.affleck.learning

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors

@InvokeArg
class OpenPdfArgs { lateinit var uri: String }

/** A permission-based reference to the original document. No PDF is copied into the app. */
@TauriPlugin
class DocumentsPlugin(private val activity: Activity) : Plugin(activity) {
  private val io = Executors.newSingleThreadExecutor()
  private var picking = false

  @Command
  fun pickPdf(invoke: Invoke) {
    if (picking) { invoke.reject("A document picker is already open."); return }
    picking = true
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "application/pdf"
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    try { startActivityForResult(invoke, intent, "pickedPdf") }
    catch (_: Exception) { picking = false; invoke.reject("Could not open the device's document picker.") }
  }

  @ActivityCallback
  fun pickedPdf(invoke: Invoke, result: ActivityResult) {
    picking = false
    val uri = result.data?.data
    if (result.resultCode != Activity.RESULT_OK || uri == null) { invoke.resolve(); return }
    io.execute {
      try {
        if (uri.scheme != "content") throw IllegalArgumentException("Unsupported document reference")
        val resolver = activity.contentResolver
        var name = "Document.pdf"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
        }
        val mime = resolver.getType(uri)
        if (mime != "application/pdf" && !name.endsWith(".pdf", ignoreCase = true)) {
          invoke.reject("Choose a PDF document.")
          return@execute
        }
        // Persist only validated PDF references across process/device restarts.
        resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        invoke.resolve(JSObject().put("name", name).put("uri", uri.toString()))
      } catch (_: Exception) {
        invoke.reject("Could not retain access to this PDF. Select it from your device's Files app again; no copy will be stored.")
      }
    }
  }

  @Command
  fun openPdf(invoke: Invoke) {
    val args = invoke.parseArgs(OpenPdfArgs::class.java)
    val uri = Uri.parse(args.uri)
    if (uri.scheme != "content") { invoke.reject("Reattach this PDF to restore access."); return }
    io.execute {
      try {
        val resolver = activity.contentResolver
        if (!resolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }) {
          invoke.reject("Access to this PDF has expired. Reattach PDF to restore it; your notes and progress are safe.")
          return@execute
        }
        // Check accessibility off the UI thread, without reading/storing the document bytes.
        val descriptor = resolver.openFileDescriptor(uri, "r")
        if (descriptor == null) { invoke.reject("This PDF is unavailable. Reattach it from your device."); return@execute }
        descriptor.use { }
        activity.runOnUiThread {
          val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newRawUri("PDF", uri)
          }
          if (activity.packageManager.queryIntentActivities(view, PackageManager.MATCH_DEFAULT_ONLY).isEmpty()) {
            invoke.reject("No PDF reader is available. Install or enable a PDF reader, then try again.")
            return@runOnUiThread
          }
          try {
            // Always offer the available readers, even when one was previously the default.
            activity.startActivity(Intent.createChooser(view, "Open PDF with").apply {
              addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
            invoke.resolve()
          } catch (_: ActivityNotFoundException) {
            invoke.reject("No PDF reader is available on this device.")
          } catch (_: Exception) {
            invoke.reject("Android could not open this PDF. Reattach it and try again.")
          }
        }
      } catch (_: Exception) {
        invoke.reject("This PDF was moved, removed, or is no longer accessible. Reattach PDF; your notes and progress are safe.")
      }
    }
  }
}
