# Whale Harness Desktop 0.2.0

Tauri 2 desktop app for DeepSeek Harness and Whale Mist. The release carries a
pinned Node.js and DeepSeek Harness runtime, starts the official WebUI on a
private localhost port, navigates the WebView to it, and owns process cleanup
when the app exits. It does not call `npx` or download packages at startup.

## Development

```powershell
npm install
npm run tauri icon ..\DeepSeek-Harness-whale.png
npm run dev
```

## Release outputs

- `..\release\Whale Harness Desktop Portable\`: self-contained portable folder
- `..\Whale Harness Desktop.lnk`: whale-icon shortcut
- `..\启动 Whale Harness Desktop.cmd`: one-click launcher that pins the workspace
- `..\release\Whale Harness Desktop 安装包.exe`: Windows x64 installer

The release window owns a private `dsh --profile whale-desktop` process. It
prefers port `3210` so WebView-local appearance settings persist, and falls back
to a free dynamic port if needed. Closing the window stops the complete child
process tree.

Set `WHALE_HARNESS_WORKSPACE` when launching from a checkout layout other than
this workspace. The app creates `~/.dsh/profiles/whale-desktop` and refreshes an
app-managed copy of Whale Mist there. User credentials, sessions, attachments,
settings, and authored patches remain under the user's normal `.dsh` directory;
none of them are included in the executable, portable folder, or installer.

Bundled versions:

- Node.js `v24.18.0`
- `@deepseek-ai/dsh` `0.1.0-rc.6`
- Whale Mist `0.3.0`
