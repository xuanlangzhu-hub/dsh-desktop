# Whale Harness Desktop 0.3.0

Tauri 2 desktop app for DeepSeek Harness and Whale Mist. The release carries a
pinned Node.js and DeepSeek Harness runtime, starts the official WebUI on a
private localhost port, navigates the WebView to it, and owns process cleanup
when the app exits. It does not call `npx` or download packages at startup.

Version `0.3.0` includes the 0.1.1-rc.1-compatible vision-bridge v2. Declared vision
models keep the official native image pipeline; text-only DeepSeek models keep
image blocks in the session for previews and serialize them into notes containing
the attachment ID and local path.
The runtime build fails if upstream package markers drift instead of silently
shipping an unpatched bundle.

## Experimental WSL2 backend

Windows stays the Tauri host. The executable keeps the Windows backend as its
unset default, while this checkout's main shortcut enables the optional Linux
DSH backend:

```powershell
npm run prepare:wsl-runtime       # one-time; installs into ~/.local/share/whale-harness/runtime
..\启动 Whale Harness Desktop (WSL).cmd
```

Or set `WHALE_HARNESS_BACKEND=wsl` (and optionally `WHALE_HARNESS_WSL_DISTRO`)
when launching the exe. Unset variables keep the exact Windows behavior.
`WHALE_WSL_WORKSPACE` accepts a WSL-native absolute path (the WSL launcher
defaults to `/home/hp/projects/deepseekharness`); when unset, a Windows
workspace is translated to `/mnt/<drive>/...`.
Keep the Windows `.lnk` and `.cmd` launch entry points on a local Windows drive;
do not launch them through `\\wsl.localhost\...`. The UNC path is only for
browsing files, not for starting the desktop shell.
The WSL backend uses `~/.dsh/profiles/whale-desktop-wsl` and binds
`127.0.0.1` only; Linux projects under `~/projects` run at native speed.
The WSL runtime requires `build-essential` inside Ubuntu2 because `node-pty`
ships no Linux prebuilds and compiles from source.

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
and Linux before launching. Closing the window stops the complete child process
tree.

Set `WHALE_HARNESS_WORKSPACE` when launching from a checkout layout other than
this workspace. The app creates `~/.dsh/profiles/whale-desktop` and refreshes an
app-managed copy of Whale Mist there. User credentials, sessions, attachments,
settings, and authored patches remain under the user's normal `.dsh` directory;
none of them are included in the executable, portable folder, or installer.

Bundled versions:

- Node.js `v24.18.0`
- `@deepseek-ai/dsh` `0.1.1-rc.1`
- Whale Mist `0.2.1`
