<#
    Marine Plastic Tracker - register watchdog + auto-detect as Windows tasks
    ---------------------------------------------------------------------------
    Makes the stack self-sustaining so you NEVER hand-start the engine again:

      * MPT-Watchdog     runs at every logon, keeps DB/Redis/engine/backend alive
      * MPT-AutoDetect   runs a real detection sweep every -IntervalHours

    Both run hidden under your own account (no admin service, no console window).
    Data + processes survive session changes; the watchdog restarts anything that
    dies. Re-run with -Uninstall to remove them.

    Usage:
        powershell -ExecutionPolicy Bypass -File infra\install-scheduled-tasks.ps1
        powershell -File infra\install-scheduled-tasks.ps1 -IntervalHours 3
        powershell -File infra\install-scheduled-tasks.ps1 -Uninstall

    Note: if your machine policy blocks Register-ScheduledTask without elevation,
    run this from an elevated PowerShell, or just use keep-alive.cmd instead.
#>
[CmdletBinding()]
param(
    [double] $IntervalHours = 6,
    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'
$Watchdog   = Join-Path $PSScriptRoot 'watchdog.ps1'
$AutoDetect = Join-Path $PSScriptRoot 'auto-detect.ps1'
$WatchName  = 'MPT-Watchdog'
$DetectName = 'MPT-AutoDetect'

function Remove-TaskIfPresent([string]$name) {
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Host "removed task: $name"
    }
}

if ($Uninstall) {
    Remove-TaskIfPresent $WatchName
    Remove-TaskIfPresent $DetectName
    Write-Host "`nUninstalled. The services already running are unaffected; close their windows to stop them."
    return
}

# --- Watchdog: at logon, loop forever ---
Remove-TaskIfPresent $WatchName
$watchAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "{0}"' -f $Watchdog)
$watchTrigger  = New-ScheduledTaskTrigger -AtLogOn
$watchSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3
Register-ScheduledTask -TaskName $WatchName -Action $watchAction -Trigger $watchTrigger `
    -Settings $watchSettings -Description 'Keeps the Marine Plastic Tracker stack alive' | Out-Null
Write-Host "registered task: $WatchName (runs at logon)"

# --- Auto-detect: every N hours, one sweep ---
Remove-TaskIfPresent $DetectName
$detectAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "{0}" -RunOnce' -f $AutoDetect)
$detectTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)
$detectSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $DetectName -Action $detectAction -Trigger $detectTrigger `
    -Settings $detectSettings -Description 'Runs a real Marine Plastic Tracker detection sweep on a schedule' | Out-Null
Write-Host "registered task: $DetectName (every $IntervalHours h)"

Write-Host "`nDone. The watchdog will start at your next logon; to start it now without"
Write-Host "waiting, run:  Start-ScheduledTask -TaskName $WatchName"
Write-Host "Remove both with: powershell -File infra\install-scheduled-tasks.ps1 -Uninstall"
