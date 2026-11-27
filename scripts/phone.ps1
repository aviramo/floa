# On the same Wi-Fi this script is not needed: open http://192.168.1.191 on the phone (the dev server, scripts/dev.mjs, listens on the LAN).
# Open the local dev server on an Android phone connected over ADB (USB or wireless debugging).
# Usage: powershell -File scripts/phone.ps1 [path] [port]    e.g. scripts/phone.ps1 biodanza/
# The reverse is lost when the phone disconnects, so run this again after reconnecting.
# If "Address already in use": turn off Port forwarding in chrome://inspect (it holds the same phone port).
param([string]$Path = "biodanza/", [int]$Port = 80)

# the phone cannot listen on a port below 1024 (adbd is not root), so the PC's port 80 is reached as the phone's localhost:8080
$Phone = if ($Port -lt 1024) { 8080 } else { $Port }

$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" }
if (-not (Test-Path $adb)) { $adb = "C:\tools\platform-tools\adb.exe" }
if (-not (Test-Path $adb)) { Write-Error "adb not found"; exit 1 }

& $adb reverse "tcp:$Phone" "tcp:$Port"
if ($LASTEXITCODE -ne 0) { Write-Error "adb reverse failed (phone not connected, or chrome://inspect port forwarding is on)"; exit 1 }
& $adb shell am start -a android.intent.action.VIEW -d "http://localhost:$Phone/$Path" com.android.chrome | Out-Null
Write-Host "Opened http://localhost:$Phone/$Path on the phone"
