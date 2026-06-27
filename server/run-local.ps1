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

& $node "src/index.js" 1>> $stdoutLog 2>> $stderrLog
exit $LASTEXITCODE
