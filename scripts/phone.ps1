# Runs BAC MGT on a phone plugged in by USB (USB debugging on).
#
#   powershell -ExecutionPolicy Bypass -File scripts\phone.ps1          # dev build, live reload via Metro
#   powershell -ExecutionPolicy Bypass -File scripts\phone.ps1 -Release # standalone APK, works without the PC
param([switch]$Release)

$ErrorActionPreference = 'Stop'
$jdk = Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -Filter 'jdk-17*' | Select-Object -First 1
if (-not $env:JAVA_HOME -and $jdk) { $env:JAVA_HOME = $jdk.FullName }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$devices = (adb devices) -match "`tdevice$"
if (-not $devices) {
  Write-Host 'No phone found. Plug it in by USB, enable USB debugging and accept the "Allow USB debugging?" prompt.' -ForegroundColor Yellow
  adb devices -l
  exit 1
}
Write-Host "Phone: $($devices -join ', ')" -ForegroundColor Green

if ($Release) {
  Push-Location android
  .\gradlew.bat assembleRelease --console=plain
  Pop-Location
  $apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
  adb install -r $apk
  adb shell monkey -p com.bac.mgt -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host "Installed $apk" -ForegroundColor Green
} else {
  adb reverse tcp:8081 tcp:8081 | Out-Null
  npx react-native run-android
}
