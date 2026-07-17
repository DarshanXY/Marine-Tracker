@echo off
rem Start the local PostgreSQL 17.5 cluster (portable, no install/admin).
rem Binaries: infra\pgsql   Data: infra\pgdata   Port: 5432
rem User: mpt_user / mpt_dev_pass   DB: marine_plastic
rem Run this after a reboot (the server does not auto-start).

set PGBIN=%~dp0pgsql\bin
set PGDATA=%~dp0pgdata

"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" status >nul 2>&1
if %errorlevel%==0 (
  echo PostgreSQL is already running.
) else (
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%PGDATA%\server.log" start
)
