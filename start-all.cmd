@echo off
rem ============================================================
rem  Marine Plastic Tracker - one-click full stack launcher
rem  Starts: PostgreSQL, Redis, Python engine, CLAY GPU verifier, backend, frontend
rem  Each service opens in its own window; close a window to stop it.
rem ============================================================
cd /d %~dp0

call infra\start-db.cmd
call infra\start-redis.cmd

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel%==0 ( echo Python engine already on :8000 ) else (
  start "MPT engine :8000" cmd /k "call \"%~dp0python_engine\start-engine.cmd\""
)

rem Clay GPU sidecar — the 2nd-stage foundation-model verifier (CONFIRMED tier,
rem ~0.92 plastic precision). Without it, every scan silently runs MLP-only, so it
rem is part of the default stack — the system should always run at full capability.
netstat -ano | findstr ":8010" | findstr "LISTENING" >nul
if %errorlevel%==0 ( echo Clay verifier already on :8010 ) else (
  start "MPT Clay verifier :8010" cmd /k "cd /d %~dp0python_engine && set KMP_DUPLICATE_LIB_OK=TRUE && conda run -n mpt-train python clay_service.py --port 8010"
)

netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel%==0 ( echo Backend already on :3001 ) else (
  start "MPT backend :3001" cmd /k "cd /d %~dp0backend && npm run dev"
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if %errorlevel%==0 ( echo Frontend already on :5173 ) else (
  start "MPT frontend :5173" cmd /k "cd /d %~dp0frontend && npm run dev"
)

echo.
echo All services launching - open http://localhost:5173
pause
