@echo off
setlocal EnableExtensions
set "WHALE_HARNESS_WORKSPACE=%~dp0"
set "WHALE_HARNESS_BACKEND=wsl"
rem Use the same packaged desktop binary as the normal launcher. During local
rem development, fall back to the latest release build until portable packaging
rem has completed.
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
