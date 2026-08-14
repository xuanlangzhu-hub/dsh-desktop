@echo off
setlocal EnableExtensions
set "WHALE_HARNESS_WORKSPACE=%~dp0"
set "WHALE_DESKTOP_EXE=%~dp0release\Whale Harness Desktop Portable\Whale Harness Desktop.exe"
if not exist "%WHALE_DESKTOP_EXE%" goto desktop_missing
start "" "%WHALE_DESKTOP_EXE%"
exit /b 0

:desktop_missing
echo Whale Harness Desktop portable release was not found.
echo Rebuild it from the whale-desktop folder or use the installer in release.
pause
exit /b 1
