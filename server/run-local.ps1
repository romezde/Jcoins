$ErrorActionPreference = "Stop"

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = (Get-Command node -ErrorAction Stop).Source
}

$logDir = Join-Path $env:LOCALAPPDATA "JCoins\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "server.out.log"
$stderrLog = Join-Path $logDir "server.err.log"

Set-Location $PSScriptRoot
$env:NODE_ENV = "production"

while ($true) {
  try {
    & $node "src/index.js" 1>> $stdoutLog 2>> $stderrLog
    $exitCode = $LASTEXITCODE
  } catch {
    $exitCode = 1
    "[$(Get-Date -Format o)] Launcher error: $($_.Exception.Message)" | Add-Content -LiteralPath $stderrLog
  }
  "[$(Get-Date -Format o)] Server exited with code $exitCode. Restarting in 10 seconds." | Add-Content -LiteralPath $stderrLog
  Start-Sleep -Seconds 10
}
