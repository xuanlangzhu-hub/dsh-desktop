# Whale Standard · Git Bash

为官方 Windows DeepSeek Harness Desktop `0.2.0-rc.2` 增加独立的
`标准模式 (Git Bash)` 预设。官方标准模式与 PowerShell 保留，默认预设和
默认访问权限不会自动改变。旧的 `~/.dsh/.agent-presets/minimal-gitbash` 不覆盖。

这份预设从官方 `dsh-v0.2.0-rc.2` 标准工具组合派生，保留文件工具、搜索、
技能、任务、后台任务、计划和压缩等组合，仅在独立 `shell` realm 中挂载
Git Bash 执行器与 `bash` 工具。标准组合遵循附带的 DeepSeek MIT License。

## 当前限制

在 2026-10-01 的实机测试中，Windows 只读受限令牌下，MSYS Bash 启动报
`couldn't create signal pipe, Win32 error 5`。完全访问执行正常。因此执行器在
受限模式下会明确拒绝，保留原来的权限，不会悄悄改为无限制执行。

命令可在用户主动选择的完全访问会话中执行；也可保持会话权限，通过官方
`bash` 工具的正常 `sandbox_permissions: danger-full-access` 审批仅授权一条命令。
如果不希望扩大命令权限，请使用原 PowerShell 标准模式。

## 使用

在官方 Desktop 的插件页安装本目录打出的包并启用。新建会话后选择
`标准模式 (Git Bash)`；已经开始的会话受官方预设锁定规则约束，不能直接切换。

Git Bash 自动从 `GIT_BASH`、常见 Git 安装位置和 PATH 中的 Git 安装目录探测。
Windows 的 `System32/bash.exe` 是 WSL 启动器，会被排除。可在新预设的
执行器配置 `shellPath` 中显式指定 Git for Windows 的 `bash.exe`。

传给工具的 `workdir` 使用 `F:/project` 等 Windows 路径；Bash 命令内部可使用
`/f/project`。每次调用是新的非交互 Bash，`cd` 和 `export` 不跨调用保持。

## 验证与构建

```powershell
npm run check
npm test
npm pack
```

`qa/desktop-sdk.mjs` 通过已安装官方 EXE 的 `ELECTRON_RUN_AS_NODE` 模式运行，
复用该 Desktop 的真实 Cordis、Windows subprocess 和 shell SDK，不调用模型。
已验证中文目录/UTF-8 输出、Node/Git 可见性、退出码、后台句柄、超时终止及
受限调用拒绝。测试只使用仓库 `.tmp` 下自己的夹具目录。
