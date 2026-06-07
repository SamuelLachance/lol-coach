# Register Windows scheduled task: daily meta refresh at 07:00
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $ProjectRoot "scripts\run_daily_meta_refresh.ps1"
$TaskName = "LoLCoach-DailyMetaRefresh"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "07:00"
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Refresh LoL Coach lane rates and item builds" -Force

Write-Host "Registered scheduled task: $TaskName (daily 07:00)"
Write-Host "Script: $Script"
