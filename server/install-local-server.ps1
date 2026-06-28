$ErrorActionPreference = "Stop"

$taskName = "JCoins Local Server"
$serverScript = Join-Path $PSScriptRoot "run-local.ps1"
$hiddenRunner = Join-Path $PSScriptRoot "run-hidden.vbs"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$hiddenRunner`" `"$serverScript`""

Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
Write-Output "JCoins local server task updated to run invisibly."
