@echo off
setlocal
chcp 65001 >nul
title Whale Mist Prototype
cd /d "%~dp0"

set "PORT=4173"
set "URL=http://127.0.0.1:%PORT%/"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173/' -TimeoutSec 1; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  where python >nul 2>&1
  if errorlevel 1 (
    echo [Whale Mist] 未找到 Python，无法启动本地预览。
    echo 请安装 Python 后重试。
    pause
    exit /b 1
  )
  start "Whale Mist Preview" /min python -m http.server %PORT% --bind 127.0.0.1
  timeout /t 2 /nobreak >nul
)

if /i "%~1"=="--test" exit /b 0
start "" "%URL%"
exit /b 0
