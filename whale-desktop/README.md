# Whale Harness Desktop 0.3.0

Tauri 2 desktop app for DeepSeek Harness and Whale Mist. The release carries a
pinned Node.js and DeepSeek Harness runtime, starts the official WebUI on a
private localhost port, navigates the WebView to it, and owns process cleanup
when the app exits. It does not call `npx` or download packages at startup.

Version `0.3.0` supports the official Vision/Files API in the bundled Windows
0.1.1-rc.1 runtime and the optional WSL2 0.1.1-rc.2 runtime. The legacy
vision-bridge v2 remains available only for an explicit 0.1.0-rc.6 rollback and
fails closed if upstream package markers drift.

## Experimental WSL2 backend

Windows stays the Tauri host. The executable keeps the Windows backend as its
unset default, while this checkout's main shortcut enables the optional Linux
DSH backend:

```powershell
npm run prepare:wsl-runtime       # one-time; installs into ~/.local/share/whale-harness/runtime
..\启动 Whale Harness Desktop (WSL).cmd
```

The EXE also accepts `--backend=wsl`, `--wsl-distro=<name>`, and
`--wsl-workspace=<absolute-linux-path>`; workspace and taskbar shortcuts use
these arguments directly. Environment variables remain supported, and unset
configuration keeps the Windows fallback behavior.
`WHALE_WSL_WORKSPACE` accepts a WSL-native absolute path (the WSL launcher
defaults to `/home/hp/projects/deepseekharness`); when unset, a Windows
workspace is translated to `/mnt/<drive>/...`.
Keep the Windows `.lnk` and `.cmd` launch entry points on a local Windows drive;
do not launch them through `\\wsl.localhost\...`. The UNC path is only for
browsing files, not for starting the desktop shell.
The WSL backend uses `~/.dsh/profiles/whale-desktop-wsl` and binds
`127.0.0.1` only; Linux projects under `~/projects` run at native speed.
The WSL preparation validates Linux x64 native modules and keeps
`build-essential` available as a source-build fallback.

## Development

```powershell
npm install
npm run tauri icon ..\DeepSeek-Harness-whale.png
npm run dev
```

## Release outputs

- `..\release\Whale Harness Desktop Portable\`: self-contained portable folder
- `..\Whale Harness Desktop.lnk`: whale-icon shortcut using the WSL2 backend
- `..\Whale Harness Desktop (Windows).lnk`: Windows-backend fallback shortcut
- `..\启动 Whale Harness Desktop.cmd`: Windows one-click launcher that pins the workspace
- `..\启动 Whale Harness Desktop (WSL).cmd`: WSL2 one-click launcher
- `..\release\Whale Harness Desktop 安装包.exe`: Windows x64 installer

The release window owns a private DSH process under the selected profile. It
prefers port `3210` so WebView-local appearance settings persist, and falls back
to a free dynamic port if needed. WSL mode checks availability in both Windows
and Linux before launching. Closing the window hides the app to the system tray; choosing “退出” stops the
complete child process tree.

Set `WHALE_HARNESS_WORKSPACE` when launching from a checkout layout other than
this workspace. The app creates `~/.dsh/profiles/whale-desktop` and refreshes an
app-managed copy of Whale Mist there. User credentials, sessions, attachments,
settings, and authored patches remain under the user's normal `.dsh` directory;
none of them are included in the executable, portable folder, or installer.

Bundled versions:

- Node.js `v24.18.0`
- Windows fallback: `@deepseek-ai/dsh` `0.1.1-rc.1` + official Vision/Files API
- WSL2 runtime: `@deepseek-ai/dsh` `0.1.1-rc.2` + official Vision/Files API
- Whale Mist `0.2.1`
