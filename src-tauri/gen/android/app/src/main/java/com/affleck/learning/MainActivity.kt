package com.affleck.learning

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    super.onWebViewCreate(webView)
  }

  @SuppressLint("MissingSuperCall")
  @Deprecated("Android invokes this for the system back gesture/button")
  override fun onBackPressed() {
    val currentWebView = webView
    if (currentWebView == null) {
      super.onBackPressed()
      return
    }
    currentWebView.evaluateJavascript(
      """
      (function () {
        try {
          return window.onAndroidBackPressed ? window.onAndroidBackPressed() : true;
        } catch (_) {
          return true;
        }
      })();
      """.trimIndent()
    ) { result ->
      if (result == "true") finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Keep the entire WebView (including dialogs) outside bars, cutouts and the keyboard.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(content)
  }
}
