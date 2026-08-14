# Ryvo Production ProGuard / R8 Rules
# Keep rules for app-specific reflection or bridge entry points.

# Retain MainActivity for AndroidManifest entry point
-keep class com.appryvo.ryvo.MainActivity { *; }
