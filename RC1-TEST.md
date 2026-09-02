# DeepSeek Harness 0.1.1-rc.1 isolated test

This worktree tracks branch `codex/dsh-rc1-test` and pins `@deepseek-ai/dsh@0.1.1-rc.1`.

## Isolation boundaries

- Worktree: `F:\deepseekharness\.tmp\rc8-test`
- One-click launcher: `启动 Whale Harness Desktop 0.1.1-rc.1 隔离测试.cmd`
- Windows DSH home: `F:\deepseekharness\.tmp\rc8-data\windows-dsh-home`
- Tauri identifier: `ai.deepseek.harness.whale.rc11rc1test`
- App/log data: `%LOCALAPPDATA%\ai.deepseek.harness.whale.rc11rc1test`
- Window title: `Whale Harness Desktop 0.1.1 RC1 Test`

The launcher does not read the production DSH home, replace production shortcuts, or copy credentials and sessions.

## Compatibility changes under test

- Whale Appearance 0.3.0 adds the default Whale Abyss dark theme, keeps Whale Mist as its light option, and preserves the selected theme after model and reasoning-effort changes.
- vision-bridge v2 keeps the official native image pipeline for declared vision models and bridges images to local-path notes for text-only models.
- HTML5 image drag/drop is handed to the official WebUI instead of being intercepted by Tauri.
- Windows and WSL launch paths pass `--no-open`, so the desktop WebView does not open a second browser window.
- Closing the window hides it to the tray; a second shortcut/taskbar launch wakes the existing process instead of creating a duplicate backend.

## Verified

- `dsh --help` and native module imports
- vision-bridge syntax, idempotence, nested copies, and marker-drift failure
- HTML5 drag/drop configuration
- tray hide followed by second launch keeps the original PID and one backend
- `npm run check`
- `npm run qa:single-instance`
- `cargo fmt --check`
- `cargo test` (7/7)
- real desktop launch on `127.0.0.1:3210`
