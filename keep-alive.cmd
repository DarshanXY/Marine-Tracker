@echo off
rem ============================================================
rem  Marine Plastic Tracker - keep-alive supervisor (one click)
rem  Opens a window that keeps DB, Redis, engine and backend up,
rem  auto-restarting anything that dies. Add the frontend too.
rem  Close this window to stop supervising (services keep running).
rem ============================================================
cd /d %~dp0
echo Starting Marine Plastic Tracker watchdog...
echo Logs: infra\logs\watchdog.log   (Ctrl+C to stop)
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0infra\watchdog.ps1" -IncludeFrontend
pause