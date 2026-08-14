# Fail-fast Android Debug Build Script for Capacitor Client
$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " APPRYVO Capacitor Android Debug Build " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Environment Detection
if (-not $env:ANDROID_HOME) {
    $sdkPath = "C:\Users\merto\AppData\Local\Android\Sdk"
    if (Test-Path $sdkPath) {
        $env:ANDROID_HOME = $sdkPath
        $env:ANDROID_SDK_ROOT = $sdkPath
        Write-Host "[ENV] Set ANDROID_HOME to $sdkPath" -ForegroundColor Green
    } else {
        Write-Error "ANDROID_HOME is not set and SDK path not found."
    }
}

if (-not $env:JAVA_HOME) {
    $jbrPath = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbrPath) {
        $env:JAVA_HOME = $jbrPath
        Write-Host "[ENV] Set JAVA_HOME to $jbrPath" -ForegroundColor Green
    }
}

# Add platform-tools to PATH
$platformTools = Join-Path $env:ANDROID_HOME "platform-tools"
if (Test-Path $platformTools) {
    $env:PATH = "$platformTools;$env:PATH"
}

# 2. Vite Build
Write-Host "`n[STEP 1/4] Building Vite bundle..." -ForegroundColor Yellow
Set-Location -Path "C:\Users\merto\Desktop\ryvo\mobile"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Vite production build failed!"
}

# 3. Capacitor Sync
Write-Host "`n[STEP 2/4] Syncing Capacitor Android assets & plugins..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Error "Capacitor sync failed!"
}

# 4. Gradle Debug Build
Write-Host "`n[STEP 3/4] Running Gradle assembleDebug..." -ForegroundColor Yellow
Set-Location -Path "C:\Users\merto\Desktop\ryvo\mobile\android"

if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat assembleDebug --stacktrace
} else {
    gradle assembleDebug
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle assembleDebug failed!"
}

# 5. APK Verification & Optional ADB Deploy
$apkPath = "C:\Users\merto\Desktop\ryvo\mobile\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $apkSize = (Get-Item $apkPath).Length / 1MB
    Write-Host "`n[SUCCESS] Debug APK generated successfully!" -ForegroundColor Green
    Write-Host "Path: $apkPath" -ForegroundColor Green
    Write-Host ("Size: {0:N2} MB" -f $apkSize) -ForegroundColor Green

    # Check connected ADB devices
    Write-Host "`n[STEP 4/4] Checking connected ADB devices..." -ForegroundColor Yellow
    try {
        $adbDevices = adb devices
        Write-Host $adbDevices
        if ($adbDevices -match "device\b" -and $adbDevices -notmatch "list of devices attached\s*$") {
            Write-Host "[ADB] Physical/Emulated device detected. Installing APK..." -ForegroundColor Green
            adb install -r $apkPath
            Write-Host "[ADB] Launching Appryvo app..." -ForegroundColor Green
            adb shell am start -n com.appryvo.ryvo/.MainActivity
        } else {
            Write-Host "[ADB] No active device/emulator connected for auto-install." -ForegroundColor Gray
        }
    } catch {
        Write-Host "[ADB] adb command not found or not in PATH." -ForegroundColor Gray
    }
} else {
    Write-Error "APK file not found at expected path: $apkPath"
}
