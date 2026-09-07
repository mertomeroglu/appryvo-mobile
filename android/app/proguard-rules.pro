# Ryvo Production ProGuard / R8 Rules
# Keep rules for app-specific reflection or bridge entry points.

# Retain MainActivity for AndroidManifest entry point
-keep class com.appryvo.ryvo.MainActivity { *; }

# ---------------------------------------------------------------------------
# Capacitor bridge — runtime annotations must survive R8
#
# R8 (full mode, the AGP 8 default) deleted com.getcapacitor.annotation.*
# from the release dex. The bridge reads those annotations reflectively, so
# PluginHandle.getPluginAnnotation() returned null and every permission-aware
# plugin call died in Bridge.getPermissionStates():
#
#   java.lang.NullPointerException
#     at com.getcapacitor.Plugin.getPermissionStates
#     at com.capacitorjs.plugins.geolocation.GeolocationPlugin.checkPermissions
#
# That is why the map screen (and the camera) crashed only in the Play build:
# debug APKs are not minified.
# ---------------------------------------------------------------------------
-keepattributes *Annotation*,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod

# The annotation types themselves. If these go, the annotations referencing
# them are dropped from the plugin classes as well.
-keep @interface com.getcapacitor.annotation.**
-keep class com.getcapacitor.annotation.** { *; }
-keep @interface com.getcapacitor.PluginMethod
-keep class com.getcapacitor.PluginMethod { *; }
-keep @interface com.getcapacitor.NativePlugin
-keep class com.getcapacitor.NativePlugin { *; }

# Bridge internals are reached by reflection from the WebView.
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins are instantiated by name from assets/capacitor.plugins.json and
# invoked reflectively, so keep the classes and their members intact.
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
