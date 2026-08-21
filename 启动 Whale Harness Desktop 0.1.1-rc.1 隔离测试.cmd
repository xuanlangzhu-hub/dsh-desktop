@echo off
setlocal
set "TEST_ROOT=%~dp0"
set "DSH_HOME=F:\deepseekharness\.tmp\rc8-data\windows-dsh-home"
set "WHALE_HARNESS_BACKEND=windows"
set "WHALE_HARNESS_WORKSPACE=%TEST_ROOT%"
set "TEST_EXE=%TEST_ROOT%whale-desktop\src-tauri\target\debug\whale-harness-desktop.exe"

if not exist "%TEST_EXE%" (
  echo 0.1.1-rc.1 isolated test executable is missing.
  echo Build it from: %TEST_ROOT%whale-desktop
  echo Command: cargo build --manifest-path src-tauri\Cargo.toml
  pause
  exit /b 1
)

if not exist "%DSH_HOME%" mkdir "%DSH_HOME%"
start "Whale Harness Desktop 0.1.1 RC1 Test" "%TEST_EXE%"
endlocal
