# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# The local document bridge is loaded by name and its callbacks via reflection.
-keep class com.affleck.learning.DocumentsPlugin { *; }
-keep class com.affleck.learning.OpenPdfArgs { *; }

# Tauri discovers the activity/plugin bridge and command argument types through
# reflection. Keep only those bridge entry points; the rest of the release
# application can be shrunk by R8.
-keep class app.tauri.** { *; }
