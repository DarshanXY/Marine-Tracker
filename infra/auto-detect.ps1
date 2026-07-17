<#
    Marine Plastic Tracker - continuous automatic detection
    ---------------------------------------------------------------------------
    Periodically triggers a real detection sweep across every monitored region by
    calling the backend's /api/pipeline/scheduled-run endpoint. Each call runs one
    live engine pass per region (real Sentinel-2 pixels -> FDI -> CNN -> DBSCAN ->
    drift) and PERSISTS the results, so dashboards, hotspots and alerts stay fresh
    with no manual "Run pipeline" clicks.

    This is the project's sanctioned EXTERNAL scheduler (the architecture forbids
    an in-process APScheduler). Sentinel-2 revisits a spot roughly every 5 days,
    so a 6-hour cadence keeps drift forecasts and alerts current without hammering
    the providers. Tune with -IntervalHours.

    Usage:
        powershell -ExecutionPolicy Bypass -File infra\auto-detect.ps1            # loop every 6h
        powershell -File infra\auto-detect.ps1 -IntervalHours 3
        powershell -File infra\auto-detect.ps1 -RunOnce                           # single sweep (for Task Scheduler)
        powershell -File infra\auto-detect.ps1 -Token $env:SCHEDULER_TOKEN        # if SCHEDULER_TOKEN is set
#>
[CmdletBinding()]
param(
    [string] $BackendUrl   = 'http://localhost:3001',
    [double] $IntervalHours = 6,
    [string] $Token        = '',
    [switch] $RunOnce
)

$ErrorActionPreference = 'Continue'
$LogDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir 'auto-detect.log'

function Write-Log([string]$msg, [string]$level = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $msg
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Invoke-Sweep {
    $url = "$BackendUrl/api/pipeline/scheduled-run"
    if ($Token) { $url = "$url?token=$Token" }
    Write-Log "triggering detection sweep -> $url"
    # POST with a generous timeout: one live engine run per region (real satellite
    # fetch + inference) can take a few minutes cold; the queue path returns fast.
    $body = & curl.exe -s --max-time 900 -X POST $url `
        -H 'Content-Type: application/json' 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "sweep request failed (curl exit $LASTEXITCODE) - is the backend up? run infra\watchdog.ps1" 'ERROR'
        return
    }
    # Keep the log readable; the endpoint returns JSON with per-region counts.
    $short = if ($body.Length -gt 600) { $body.Substring(0, 600) + '...' } else { $body }
    Write-Log "sweep response: $short"
}

Write-Log "auto-detect started (every ${IntervalHours}h, backend=$BackendUrl, runOnce=$RunOnce)"
do {
    try { Invoke-Sweep } catch { Write-Log "sweep error: $($_.Exception.Message)" 'ERROR' }
    if ($RunOnce) { break }
    Start-Sleep -Seconds ([int]($IntervalHours * 3600))
} while ($true)
Write-Log 'auto-detect exiting'
