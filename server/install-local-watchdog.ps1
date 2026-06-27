$ErrorActionPreference = "Stop"

$taskName = "JCoins Server Watchdog"
$watchScript = Join-Path $PSScriptRoot "watch-local.ps1"
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchScript`""
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$minuteTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logonTrigger, $minuteTrigger) -Settings $settings -Description "Restarts the local JCoins API when its health check fails." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "JCoins watchdog installed."
