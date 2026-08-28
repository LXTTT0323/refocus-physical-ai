$ErrorActionPreference = "Stop"

$profilePath = "C:\Espressif\tools\Microsoft.v5.5.4.PowerShell_profile.ps1"
$smokeTest = Join-Path $PSScriptRoot "..\handoff\serial_smoke_test.py"

Write-Host "RE:FOCUS competition hardware environment check" -ForegroundColor Cyan

if (Test-Path -LiteralPath $profilePath) {
    . $profilePath
    $idfVersion = idf.py --version
    Write-Host "[OK] $idfVersion" -ForegroundColor Green
} else {
    Write-Host "[MISSING] ESP-IDF 5.5.4 activation profile: $profilePath" -ForegroundColor Red
}

$platformio = Get-Command pio -ErrorAction SilentlyContinue
if ($platformio) {
    Write-Host "[OK] $(pio --version)" -ForegroundColor Green
} else {
    Write-Host "[OPTIONAL] PlatformIO not found; the official C V2 build uses ESP-IDF." -ForegroundColor Yellow
}

python $smokeTest --self-test
if ($LASTEXITCODE -ne 0) { throw "Serial protocol self-test failed" }
Write-Host "[OK] RE:FOCUS serial protocol parser" -ForegroundColor Green

$ports = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
if (-not $ports) {
    Write-Host "[WAITING] No COM port detected. Connect the C board with a USB data cable." -ForegroundColor Yellow
    exit 0
}

Write-Host "[FOUND] Serial ports: $($ports -join ', ')" -ForegroundColor Green
python $smokeTest --list
Write-Host "Next: run python handoff/usb_web_bridge.py --port auto, then open https://refocus-physical-ai.vercel.app/?hardware=1." -ForegroundColor Cyan
