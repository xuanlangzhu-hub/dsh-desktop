# Official DeepSeek Harness Desktop migration

The official Windows Desktop uses its own `~/.dsh/profiles/desktop` plugin profile.
The former Whale Harness Desktop release and its WSL backend are separate.

`dsh-whale-mist` 0.5.0 adds a peer declaration for official Desktop 0.2.0-rc.2.
On 2026-09-30, the theme and `dsh-reasoning-effort` 0.8.0 were installed from
the fixed packages under `release/plugins/` through Desktop's Plugins page.
The Desktop profile records `file:F:/deepseekharness/release/plugins/...`
specifiers; keep the archives referenced by the active profile when removing old Windows release binaries,
so future plugin operations can still resolve them.
Both are enabled in the independent Desktop profile. The official app rendered
both Whale Mist and Whale Abyss, the appearance controls, an existing session,
and the new reasoning selector. A new DeepSeek-V41-Flash session switched Off
and back to High; the Mist slider showed a blue-white resting track and purple
motion, while Abyss kept its dark violet effect. A normal application quit and
cold relaunch retained Abyss, both plugins, and the High slider state. The earlier reasoning-effort
and notification patches target the old Tauri/WebView shell and were not
applied to official Desktop.

Whale was subsequently upgraded to `0.5.2` from
`release/plugins/dsh-whale-mist-0.5.2.tgz` to fix the running taskbar icon.
This is the archive referenced by the active Desktop profile; preserve it along
with the reasoning-effort archive. The runtime icon was verified on a cold
launch on 2026-09-30: both real window icon handles and the taskbar relaunch icon
property matched the packaged Whale asset. The official EXE signature remained
valid. Installing a new version of an already enabled plugin did not replace
its cached Host module immediately; a full normal quit/relaunch loaded the new
host code. The old `0.5.1` attempt relied on an environment flag that official
Desktop supplies to package-manager children only, so it did not start a helper.

The active third-party bundles are now:

| Package | Installed version | Capability |
| --- | --- | --- |
| dsh-whale-mist | 0.5.2 | Whale Mist/Abyss appearance and the transparent white Windows taskbar icon |
| dsh-reasoning-effort | 0.8.0 | Model and reasoning-effort selector |
| dsh-pet | 0.3.0 | Animated pet, work-state animations, and completion/attention notifications |

The archived-sessions plugin is superseded by official archive management.
The pet compatibility change ([PR #68](https://github.com/PC2005-cloud/dsh-pet/pull/68))
was merged and the author published
[v0.3.0](https://github.com/PC2005-cloud/dsh-pet/releases/tag/v0.3.0), which declares
DSH 0.2 peers. The original npm archive was verified against its registry SHA512
and installed/enabled through the official Desktop Plugins page. The archive is
`release/plugins/dsh-pet-0.3.0.tgz` (SHA256
`ADBAE6144EE287E8A4D280C96590BFC362B54B1CCA55477F697B922AE5F3FA85`).

The blue-haired maid animates inside the DSH window (`display: web`, width 400).
The initial anchor is bottom-left, with a 72px vertical offset to leave room for
the account menu. Automatic whispering and balance polling are disabled;
work-state animations and system notifications are enabled. The user settings
are in `~/.dsh/dsh-pet/main-config.json` and editable from Settings > 桌宠配置.
No separate Electron pet runtime was downloaded or started.

The bundled notification function replaces the old `dsh-notification` install,
avoiding duplicate reminders. Its test notification reached the Windows
notification database. On 2026-09-30 the user independently verified a real
completion popup and supplied a screenshot of Windows Notification Center:
source "DeepSeek Harness", title "对话完成", time 13:02. Completion notification
acceptance is complete; no further model round is needed for this acceptance.
The read-only `qa/notification-delivery.mjs` check reports only the pet's known
toast titles and delivery times from Windows' database.

Keep the old Windows session data: at least one V0 history
currently fails the official V0-to-V1 converter on an unexpected
`permission/preset.origin` field. Another old session renders but cannot change
its model/effort because its historical `anchored-standard` Agent preset is not
registered in Desktop 0.2. Its original Max setting remained unchanged after
the failed attempt. Do not retire the old session data until these paths are
resolved.

Theme 0.5.2 also sets the official Windows shell's live window icons and
`System.AppUserModel.RelaunchIconResource`, keeping the `com.deepseek.dsh`
identity. This fixes the running taskbar icon that a `.lnk` change alone did not
cover. Its small native helper is compiled from source packaged with the theme,
checks the exact shell PID/executable, and restores original window properties
on Host disposal. No EXE or `app.asar` modification is needed. A hidden real
Windows fixture verifies the icon handles, taskbar properties, and restoration.
The local status and a PNG exported from the live window's actual icon handle
are under `%LOCALAPPDATA%\Whale Appearance`.

The application and tray resources still belong to the official installer.
The pinned shortcut uses an independent copy of the Whale ICO under
`%LOCALAPPDATA%\Whale Appearance`, so it survives retirement of the old Tauri
release directory. To preview the exact shortcut target and icon:

```powershell
pwsh -NoProfile -File .\official-desktop\set-whale-taskbar-icon.ps1
```

To change the official shortcut icon, run the same script with `-Apply`.
It backs up the original `.lnk`, preserves `com.deepseek.dsh` and the executable
target, and only changes the shortcut icon. `-Restore` uses that backup. The
pinned shortcut originally pointed to the user-local `DeepSeek-Harness.ico`; its original
is saved beside that icon as `DeepSeek Harness.original-pinned.lnk`. If that pin
is absent, the script updates the official Start Menu shortcut instead, with a
separate `DeepSeek Harness.original-start-menu.lnk` backup. `-RefreshCache`
works even when the icon path is already correct. The signed official
EXE and tray resource remain unmodified, and a future official update may reset
the shortcut icon. Re-running `-Apply` is supported after such an update.
