@echo off
setlocal EnableExtensions
chcp 65001 >nul
title DeepSeek Harness - Whale TUI

cd /d "%~dp0.."
where npx.cmd >nul 2>&1
if errorlevel 1 goto node_missing

npx.cmd --yes @deepseek-ai/dsh --profile tui %*
set "DSH_EXIT=%ERRORLEVEL%"
if not "%DSH_EXIT%"=="0" pause
exit /b %DSH_EXIT%

:node_missing
echo npx was not found. Install Node.js first.
pause
exit /b 1
