@echo off
rem Start the local portable Redis 8.8 (BullMQ queue backend). Port: 6379
rem Binaries: infra\redis   Data: infra\redis\data
rem Run this after a reboot (does not auto-start).

set RBIN=%~dp0redis

"%RBIN%\redis-cli.exe" -p 6379 ping >nul 2>&1
if %errorlevel%==0 (
  echo Redis is already running.
) else (
  start "" /b "%RBIN%\redis-server.exe" --port 6379 --dir "%RBIN%\data" --maxmemory 256mb --appendonly no --save ""
  echo Redis started on :6379
)
