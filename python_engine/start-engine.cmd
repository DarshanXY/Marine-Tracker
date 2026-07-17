@echo off
setlocal
cd /d %~dp0

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo Python engine already running on http://localhost:8000
  exit /b 0
)

set "ENGINE_PYTHON="

if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import fastapi, uvicorn, pydantic; import api.app" >nul 2>nul && set "ENGINE_PYTHON=%~dp0.venv\Scripts\python.exe"
)

if not defined ENGINE_PYTHON if exist "%~dp0..\.venv\Scripts\python.exe" (
  "%~dp0..\.venv\Scripts\python.exe" -c "import fastapi, uvicorn, pydantic; import api.app" >nul 2>nul && set "ENGINE_PYTHON=%~dp0..\.venv\Scripts\python.exe"
)

if not defined ENGINE_PYTHON if exist "C:\Anaconda\python.exe" (
  "C:\Anaconda\python.exe" -c "import fastapi, uvicorn, pydantic; import api.app" >nul 2>nul && set "ENGINE_PYTHON=C:\Anaconda\python.exe"
)

if not defined ENGINE_PYTHON (
  python -c "import fastapi, uvicorn, pydantic; import api.app" >nul 2>nul && set "ENGINE_PYTHON=python"
)

if not defined ENGINE_PYTHON (
  echo No usable Python interpreter found for the Marine Plastic Tracker engine.
  echo Checked python_engine\.venv, repo .venv, C:\Anaconda\python.exe, and PATH python.
  echo Install the engine dependencies, then rerun this script.
  exit /b 1
)

echo Using %ENGINE_PYTHON%
"%ENGINE_PYTHON%" -m uvicorn api.app:app --host 127.0.0.1 --port 8000
exit /b %errorlevel%
