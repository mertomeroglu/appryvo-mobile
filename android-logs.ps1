# Logcat script for Appryvo Capacitor Android App
$ErrorActionPreference = "Continue"

if (-not $env:ANDROID_HOME) {
    $sdkPath = "C:\Users\merto\AppData\Local\Android\Sdk"
    if (Test-Path $sdkPath) {
        $env:ANDROID_HOME = $sdkPath
    }
}

$platformTools = Join-Path $env:ANDROID_HOME "platform-tools"
if (Test-Path $platformTools) {
    $env:PATH = "$platformTools;$env:PATH"
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Listening to Appryvo Android Logcat     " -ForegroundColor Cyan
Write-Host " Package: online.appryvo.mobile          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

adb logcat -c
adb logcat -v time *:E Capacitor:V chromium:V AndroidRuntime:E System.err:E | Select-String -Pattern "online.appryvo.mobile|Capacitor|chromium|FATAL|Exception|CORS|Socket.IO|401|404|500"
