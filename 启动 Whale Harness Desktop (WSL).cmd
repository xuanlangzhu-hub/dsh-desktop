@echo off
setlocal EnableExtensions
set "WHALE_HARNESS_WORKSPACE=%~dp0"
set "WHALE_HARNESS_BACKEND=wsl"
rem The Linux backend works directly in the WSL-native project checkout.
rem Override WHALE_WSL_WORKSPACE to point at another directory inside WSL.
if not defined WHALE_WSL_WORKSPACE set "WHALE_WSL_WORKSPACE=/home/hp/projects/deepseekharness"
rem Prefer the portable bundle (currently the tray build); keep the fresh
rem source-build exe as a fallback for development checkouts.
set "WHALE_DESKTOP_EXE=%~dp0release\Whale Harness Desktop Portable\Whale Harness Desktop.exe"
if not exist "%WHALE_DESKTOP_EXE%" set "WHALE_DESKTOP_EXE=%~dp0whale-desktop\src-tauri\target\release\whale-harness-desktop.exe"
if not exist "%WHALE_DESKTOP_EXE%" goto desktop_missing
rem Optional: set WHALE_HARNESS_WSL_DISTRO before launching to pick a non-default WSL2 distro.
start "" "%WHALE_DESKTOP_EXE%"
exit /b 0

:desktop_missing
echo Whale Harness Desktop portable release was not found.
echo Rebuild it from the whale-desktop folder or use the installer in release.
echo First prepare the WSL backend with:
echo   powershell -ExecutionPolicy Bypass -File "%~dp0whale-desktop\scripts\prepare-wsl-runtime.ps1"
pause
exit /b 1
