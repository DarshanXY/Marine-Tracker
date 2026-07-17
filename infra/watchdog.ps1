<#
    Marine Plastic Tracker - service watchdog / supervisor
    ---------------------------------------------------------------------------
    Keeps the whole stack alive WITHOUT you having to restart anything by hand:
    PostgreSQL (5432), Redis (6379), Python engine (8000), backend (3001),
    and optionally the frontend (5173).

    Every $IntervalSec it checks each service. If a port is down it (re)starts
    that service detached. It also HTTP-health-checks the engine and backend and
    force-restarts a process that is holding its port but no longer answering
    (a hung/half-dead process) after $MaxHttpFails consecutive failures.

    WHY THIS EXISTS: a dev server started inside another tool's shell dies when
    that tool's session ends (Windows kills the process tree). Run this watchdog
    in its OWN window (keep-alive.cmd) or as a logon scheduled task
    (install-scheduled-tasks.ps1) so it is owned by YOU and survives sessions.

    Usage:
        powershell -ExecutionPolicy Bypass -File infra\watchdog.ps1
        powershell -File infra\watchdog.ps1 -IncludeFrontend -IntervalSec 15
        powershell -File infra\watchdog.ps1 -Once      # one pass, then exit
#>
[CmdletBinding()]
param(
    [int]    $IntervalSec     = 20,
    [int]    $MaxHttpFails    = 3,
    [switch] $IncludeFrontend,
    [switch] $HealthKill,   # also force-restart a port-up service whose /health stops answering
    [switch] $Once
)

$ErrorActionPreference = 'Continue'
$Root    = Split-Path -Parent $PSScriptRoot            # repo root (infra\..)
$LogDir  = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $LogDir 'watchdog.log'

function Write-Log([string]$msg, [string]$level = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $msg
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding ascii   # ASCII: no BOM, log is plain text
}

function Test-Port([int]$port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Test-Http([string]$url, [int]$timeoutSec = 6) {
    # curl.exe ships with Windows 11 and never prompts (unlike Invoke-WebRequest
    # in -NonInteractive). Exit code 0 == a response was received.
    & curl.exe -s -o NUL --max-time $timeoutSec $url 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Get-PortPid([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
    return $null
}

function Stop-Port([int]$port) {
    $processId = Get-PortPid $port
    if ($processId) {
        Write-Log "killing hung pid $processId on port $port" 'WARN'
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

function Start-Engine {
    Write-Log 'starting Python engine on :8000'
    Start-Process -FilePath 'python' `
        -ArgumentList '-m','uvicorn','api.app:app','--host','127.0.0.1','--port','8000' `
        -WorkingDirectory (Join-Path $Root 'python_engine') `
        -WindowStyle Hidden
}

function Start-Backend {
    Write-Log 'starting backend on :3001'
    # tsx via npm; redirect logs so a crash leaves a trail. cmd /c keeps npm.cmd happy.
    $log = Join-Path $LogDir 'backend.log'
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run dev > `"$log`" 2>&1" `
        -WorkingDirectory (Join-Path $Root 'backend') `
        -WindowStyle Hidden
}

function Start-Frontend {
    Write-Log 'starting frontend on :5173'
    $log = Join-Path $LogDir 'frontend.log'
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run dev > `"$log`" 2>&1" `
        -WorkingDirectory (Join-Path $Root 'frontend') `
        -WindowStyle Hidden
}

# Consecutive HTTP-failure counters for port-up-but-not-answering detection.
$engineFails  = 0
$backendFails = 0

function Invoke-Pass {
    # --- PostgreSQL (idempotent launcher, fire-and-forget) ---
    # pg_ctl start holds its pipe until the server reports ready, so run the
    # launcher detached: the port check next pass confirms it came up, and one
    # slow cold-start never stalls the rest of this pass.
    if (-not (Test-Port 5432)) {
        Write-Log 'PostgreSQL down -> start-db.cmd' 'WARN'
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', (Join-Path $PSScriptRoot 'start-db.cmd') -WindowStyle Hidden
    }

    # --- Redis (idempotent launcher, fire-and-forget) ---
    if (-not (Test-Port 6379)) {
        Write-Log 'Redis down -> start-redis.cmd' 'WARN'
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', (Join-Path $PSScriptRoot 'start-redis.cmd') -WindowStyle Hidden
    }

    # --- Python engine (port always; /health only with -HealthKill) ---
    # The engine is a single-worker uvicorn doing CPU-bound numpy inference, so
    # during a long detection run it legitimately can't answer /health. Port-down
    # is the reliable "actually died" signal; killing on /health silence risks
    # murdering a busy engine mid-run, so that stays opt-in via -HealthKill.
    if (-not (Test-Port 8000)) {
        Write-Log 'engine port 8000 down' 'WARN'
        Start-Engine
        $script:engineFails = 0
    }
    elseif ($HealthKill -and -not (Test-Http 'http://localhost:8000/health' 10)) {
        $script:engineFails++
        Write-Log "engine /health not answering ($script:engineFails/$MaxHttpFails)" 'WARN'
        if ($script:engineFails -ge $MaxHttpFails) {
            Stop-Port 8000; Start-Engine; $script:engineFails = 0
        }
    }
    else { $script:engineFails = 0 }

    # --- Backend (port always; /health only with -HealthKill) ---
    if (-not (Test-Port 3001)) {
        Write-Log 'backend port 3001 down' 'WARN'
        Start-Backend
        $script:backendFails = 0
    }
    elseif ($HealthKill -and -not (Test-Http 'http://localhost:3001/health')) {
        $script:backendFails++
        Write-Log "backend /health not answering ($script:backendFails/$MaxHttpFails)" 'WARN'
        if ($script:backendFails -ge $MaxHttpFails) {
            Stop-Port 3001; Start-Backend; $script:backendFails = 0
        }
    }
    else { $script:backendFails = 0 }

    # --- Frontend (optional) ---
    if ($IncludeFrontend -and -not (Test-Port 5173)) {
        Write-Log 'frontend port 5173 down' 'WARN'
        Start-Frontend
    }
}

Write-Log "watchdog started (interval ${IntervalSec}s, frontend=$IncludeFrontend, healthKill=$HealthKill, root=$Root)"
do {
    try { Invoke-Pass } catch { Write-Log "pass error: $($_.Exception.Message)" 'ERROR' }
    if ($Once) { break }
    Start-Sleep -Seconds $IntervalSec
} while ($true)
Write-Log 'watchdog exiting'
