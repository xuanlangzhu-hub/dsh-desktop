# Whale Harness Desktop

一个围绕 DeepSeek Harness 官方 WebUI 构建的 Windows 桌面端实验项目。当前版本为 `0.3.0`：Tauri 负责原生窗口与进程生命周期，内置 Node.js 和固定版本 DSH，Whale Mist 提供淡蓝渐变、克制玻璃材质和简洁排版，并内置 vision-bridge v2 以保留图片预览、让纯文本 DeepSeek 模型安全接收图片文件引用。

## 目录

- `whale-desktop/`：Tauri 2 桌面端、启动页、运行时准备与打包脚本
- `dsh-whale-mist/`：官方 WebUI 的 Whale Mist 主题插件
- `dsh-whale-tui/`：早期 TUI 实验与启动脚本
- `archive/`：保留的设计原型，不参与正式构建
- `release/`：本地安装包与便携版，体积较大，不提交到 Git

## 本机启动

在当前工作区双击 `Whale Harness Desktop.lnk` 或 `启动 Whale Harness Desktop.cmd`。正式程序优先使用 `3210` 端口，被占用时自动回退到空闲端口；关闭窗口会回收其启动的完整 DSH 进程树。

## 从源码构建

要求 Windows x64、Node.js `v24.18.0`、Rust stable、WebView2 和 Visual Studio C++ Build Tools。

```powershell
cd whale-desktop
npm ci
npm run prepare:runtime
npm run check
npm run build
npm run portable
```

`prepare:runtime` 会按锁文件安装 `@deepseek-ai/dsh@0.1.0-rc.6`，应用 vision-bridge v2，使用 Node 校验补丁后的 JavaScript，再裁掉与 Windows x64 无关的原生预编译件。任何补丁标记漂移都会直接中止构建，避免产出未桥接图片的安装包。安装包和便携目录最终整理到工作区的 `release/`。

## 用户数据

程序只维护 `~/.dsh/profiles/whale-desktop` 中的专用 Profile 和 Whale Mist 副本。凭据、会话、附件与个人设置仍保存在用户自己的 `.dsh` 目录，不会进入源码仓库、安装包源码或 Git 历史。

当前构建未使用商业代码签名证书，Windows 或安全软件可能显示“未知发布者”。
