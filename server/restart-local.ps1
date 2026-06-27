$ErrorActionPreference = "Stop"

$taskName = "JCoins Local Server"

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  if ((Get-ScheduledTask -TaskName $taskName).State -ne "Running") { break }
}

if ((Get-ScheduledTask -TaskName $taskName).State -eq "Running") {
  throw "The old JCoins server task did not stop within 30 seconds."
}

$listeners = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if ($process -and $process.Name -eq "node.exe" -and $process.CommandLine -match "src[/\\]index\.js") {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 1
}
if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Port 4000 is still occupied by another process."
}

Start-ScheduledTask -TaskName $taskName
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4000/api/health" -TimeoutSec 4
    if ($response.StatusCode -eq 200) {
      Write-Output "JCoins local server restarted successfully."
      exit 0
    }
  } catch {
    # The server may still be starting.
  }
}

throw "The JCoins server did not become healthy within 30 seconds."
