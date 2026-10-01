# Whale Harness · Themes & Plugins

这个仓库最初是 Whale Harness Desktop：围绕 DeepSeek Harness 官方 WebUI 的 Tauri 桌面端实验。自 2026-09-30 起，Windows 日常使用已迁移到官方 DeepSeek Harness Desktop，仓库后续聚焦 Whale 主题、界面和其他插件。

原 Tauri 桌面壳停止主动维护，不再跟进上游桌面功能或发布新版本。`whale-desktop/`、最后的 `0.4.0` 发布记录及 WSL2 后端保留作历史实现和回滚参考；现有 WSL 运行环境与用户数据不随此次迁移删除。本仓库继续维护，未来的主题和插件按实际需求迭代。

## 官方 Desktop 与插件

已在官方 Windows Desktop `0.2.0-rc.2` 完成安装和验收：

| 插件 | 版本 | 功能 |
| --- | --- | --- |
| `dsh-whale-mist` / Whale Appearance | `0.5.2` | Whale Abyss 深色与 Whale Mist 浅色主题、透明白鲸运行时任务栏图标 |
| `dsh-reasoning-effort` | `0.8.0` | 模型选择与思考强度滑块 |
| `dsh-pet` | `0.3.0` | 蓝毛小女仆动画、工作状态联动与系统通知 |

宠物新版自带回合完成、失败和待确认提醒，已验收真实的 Windows「对话完成」通知，无需再重复安装旧版 `dsh-notification`。设置入口为官方应用的“插件”和“设置 → 桌宠配置”；Whale 外观位于“设置 → 通用设置 → 鲸系外观”。

另有可选的 [标准模式 (Git Bash)](dsh-whale-gitbash/README.md) 预设：保留标准工具集，
仅切换命令执行方式。当前 Windows MSYS 需要完全访问或明确的单次授权，
不能直接代替受限 PowerShell；安装和选择预设不会自动更改默认访问权限。

官方 Desktop 使用独立的 `~/.dsh/profiles/desktop`。当前安装包、图标恢复方式和历史会话迁移注意事项见 [迁移与验收记录](official-desktop/README.md)。社区插件来自各自作者；本仓库维护的是 Whale Appearance 和本地集成，不是官方桌面端或其他插件的分发源。

## Whale 主题开发

主题代码位于 `dsh-whale-mist/`。在 Windows 上构建可用于官方桌面端的完整包：

```powershell
cd dsh-whale-mist
npm run check
npm run build:desktop-icon
npm pack
```

Windows 图标辅助程序由 C# 源码构建，生成的 EXE 不提交 Git；构建脚本也验证窗口图标设置与还原。它只在官方 Windows Desktop Host 中运行，官方 EXE 的签名与 `app.asar` 保持原样。浏览器和 WSL 中仍使用主题的浏览器功能。具体安装与兼容范围见 [主题说明](dsh-whale-mist/README.md)。

## 目录

- `whale-desktop/`：Tauri 2 桌面端、启动页、运行时准备与打包脚本
- `dsh-whale-mist/`：官方 WebUI 的 Whale Abyss / Whale Mist 双主题插件
- `dsh-whale-gitbash/`：官方 Windows Desktop 的可选标准 Git Bash 预设与原生 SDK 验证
- `official-desktop/`：官方桌面端迁移记录、任务栏快捷方式图标工具与通知验收脚本
- `dsh-whale-tui/`：早期 TUI 实验与启动脚本
- `archive/`：保留的设计原型，不参与正式构建
- `release/`：本地安装包与便携版，体积较大，不提交到 Git

## 历史 Tauri 版本：本机启动

以下说明对应已冻结的 Whale Harness Desktop `0.4.0`，其内置 Harness 固定为 `0.1.5-rc.1`，用于保留现有环境和回滚参考。

在当前工作区双击 `Whale Harness Desktop.lnk` 默认使用 WSL2 后端；`Whale Harness Desktop (Windows).lnk` 保留为纯 Windows 备用入口。正式程序优先使用 `3210` 端口，被占用时自动回退到空闲端口；通知设置由桌面壳跨端口持久化，当前会话在窗口失焦、最小化或进入托盘后仍可收到完成提醒；关闭窗口会将应用隐藏到系统托盘并保持后端运行；从托盘菜单选择“退出”才会回收完整 DSH 进程树。

> Windows 快捷方式必须从 Windows 本地路径（例如 `F:\deepseekharness`）启动。不要通过 `\\wsl.localhost\...` 双击 `.lnk` 或 `.cmd`；Windows Shell/PowerShell 读取 WSL UNC 启动文件可能长时间阻塞。WSL 原生项目目录只作为 Harness 后端工作区使用。

## 历史 Tauri 版本：从源码构建

要求 Windows x64、Node.js `v24.18.0`、Rust stable、WebView2 和 Visual Studio C++ Build Tools。

```powershell
cd whale-desktop
npm ci
npm run prepare:runtime
npm run check
npm run build
npm run portable
```

`prepare:runtime` 会按锁文件安装 `@deepseek-ai/dsh@0.1.5-rc.1`，使用官方任意文件上传与图片管线，随后裁掉与 Windows x64 无关的原生预编译件。旧版 vision-bridge 只保留给显式回滚版本，任何兼容补丁标记漂移都会直接中止构建。安装包和便携目录最终整理到工作区的 `release/`。

## 历史 Tauri 版本：WSL2 后端

桌面壳仍运行在 Windows，但 DSH、Shell、工具和 Agent 可以改由 WSL2 里的 Linux 运行时承载。程序本身未设置环境变量时仍默认使用 Windows 后端；当前工作区的主快捷方式已配置为默认启用 WSL2。

准备（只需一次，联网安装）：

```powershell
cd whale-desktop
npm run prepare:wsl-runtime
```

- 在 Ubuntu2 内创建 `~/.local/share/whale-harness/runtime`（自包含 Node v24.18.0 + `@deepseek-ai/dsh@0.1.5-rc.1` 的 Linux 原生依赖）
- 创建独立 Profile `~/.dsh/profiles/whale-desktop-wsl`，固定安装 Whale Appearance、思考强度、宠物与桌面通知插件，并复制 Anchored Standard preset
- 使用 0.1.5 官方 Vision/Files API；仅显式回滚到 0.1.0-rc.6 时才应用旧版 vision-bridge v2
- `dsh-archived-sessions` 暂不兼容新版会话存储，已从桌面 Profile 退役；原有会话和归档数据不会被删除

启动：

- 双击 `Whale Harness Desktop.lnk` 或 `启动 Whale Harness Desktop (WSL).cmd`（等价于 `WHALE_HARNESS_BACKEND=wsl`）
- 默认工作区为 WSL 内的 `/home/hp/projects/deepseekharness`；如需其它目录，设置 `WHALE_WSL_WORKSPACE` 为 WSL 内绝对路径
- `WHALE_HARNESS_WSL_DISTRO` 可选，指定非默认的 WSL2 发行版
- 双击 `Whale Harness Desktop (Windows).lnk` 或 `启动 Whale Harness Desktop.cmd` 可使用纯 Windows 后端

WSL 后端仅监听 `127.0.0.1`，WebUI 端口仍优先 `3210`、被占用时自动回退。关闭窗口会通过 pidfile 终止 Linux 端完整 dsh/Node 进程组。

回滚到纯 Windows 模式：双击 `Whale Harness Desktop (Windows).lnk` 或 `启动 Whale Harness Desktop.cmd`。WSL 数据是隔离的，如需彻底清理可手动删除 Ubuntu2 内的 `~/.local/share/whale-harness` 与 `~/.dsh/profiles/whale-desktop-wsl`。

## 用户数据

程序只维护 `~/.dsh/profiles/whale-desktop` 中的专用 Profile 和 Whale Appearance 副本。凭据、会话、附件与个人设置仍保存在用户自己的 `.dsh` 目录，不会进入源码仓库、安装包源码或 Git 历史。WSL 后端使用 WSL 内独立的 `~/.dsh`，不会读取或覆盖 Windows 的 `%USERPROFILE%\.dsh`。

当前构建未使用商业代码签名证书，Windows 或安全软件可能显示“未知发布者”。
