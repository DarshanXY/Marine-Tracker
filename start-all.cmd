@echo off
rem ============================================================
rem  Marine Plastic Tracker - one-click full stack launcher
rem  Starts: PostgreSQL, Redis, Python engine, backend, frontend
rem  Each service opens in its own window; close a window to stop it.
rem ============================================================
cd /d %~dp0

call infra\start-db.cmd
call infra\start-redis.cmd

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel%==0 ( echo Python engine already on :8000 ) else (
  start "MPT engine :8000" cmd /k "call \"%~dp0python_engine\start-engine.cmd\""
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
