@echo off
call "%~dp0启动 TUI.cmd" --resume latest %*
exit /b %ERRORLEVEL%
