$ErrorActionPreference = "Continue"

$serverTask = "JCoins Local Server"
$logDir = Join-Path $env:LOCALAPPDATA "JCoins\logs"
$watchdogLog = Join-Path $logDir "watchdog.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-WatchdogLog($message) {
  "[$(Get-Date -Format o)] $message" | Add-Content -LiteralPath $watchdogLog
}

function Test-JCoinsApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4000/api/health" -TimeoutSec 4
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-UnmanagedJCoinsProcess {
  $listeners = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.Name -eq "node.exe" -and $process.CommandLine -match "src[/\\]index\.js") {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

$task = Get-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
if (-not $task) {
  Write-WatchdogLog "The '$serverTask' task does not exist."
  exit 1
}

if ((Test-JCoinsApi) -and $task.State -eq "Running") {
  exit 0
}

Write-WatchdogLog "The server is unhealthy or unmanaged. Recovering it."
if ($task.State -eq "Running") {
  Stop-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if ((Get-ScheduledTask -TaskName $serverTask).State -ne "Running") { break }
  }
}

Stop-UnmanagedJCoinsProcess
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 1
}

Start-ScheduledTask -TaskName $serverTask
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  if (Test-JCoinsApi) {
    Write-WatchdogLog "Local server recovered successfully."
    exit 0
  }
}

Write-WatchdogLog "Recovery started, but the API did not become healthy within 30 seconds."
exit 1
