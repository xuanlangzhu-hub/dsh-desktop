# Whale Appearance / 鲸系外观

DeepSeek Harness Web UI 的一组可安装主题，包含浅色 `Whale Mist / 鲸雾` 与
深色 `Whale Abyss / 鲸渊`。它使用官方 `ctx.theme`、Settings
扩展槽位和公开 `--dsw-*` 设计令牌，保留官方侧栏、工作区、会话、输入框、
审批、问题和 Trajectory 的数据与交互。

本插件继续维护。原 Whale Tauri 桌面壳已冻结，Windows 的当前使用入口为官方
DeepSeek Harness Desktop；后续主题和其他插件按需求独立迭代。

## 安装

在本目录的上一级运行：

```powershell
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-whale-mist
```

重新启动 `npx --yes @deepseek-ai/dsh web` 后即可使用。插件默认激活
`whale-abyss`；在“设置 → 通用 → 鲸系外观”中可随时切换“鲸雾/鲸渊”。
选择会保存在本机浏览器，并在模型或推理强度切换引发宿主重新同步主题时自动恢复。

## 设计原则

- 鲸雾使用淡蓝渐变画布；鲸渊使用深海蓝黑画布、墨蓝侧栏和略亮的输入层。
- 鲸渊以 `#8C72F2` 紫色作为选择、焦点和推理光效强调色，不把整张界面做成霓虹紫。
- 玻璃只用于分层表面；长会话上方的输入卡片使用不透明渐变，滚动文字不会穿透。
- 官方“设置 → 通用”中提供主题、背景层次、侧栏层次和玻璃强度四组简洁选项。
- 标题旁的白鲸只在 Agent 运行或刚刚完成时出现；旧版 Harness 仍会显示会话快照提供的“等待确认”状态。`0.1.5-rc.1` 不再公开该字段，因此插件会安全降级，不影响标题栏和会话输入区。
- 系统字体栈与明确行高保持中文排版稳定。
- 高频交互没有装饰性进场动画；按钮只有 120ms 的按压反馈。
- 可选的 `dsh-reasoning-effort` 在鲸雾下使用蓝白静态轨道，已激活区域以淡紫—深紫波浪表达强度；鲸渊保留插件原版深色紫色辐射效果。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency` 和高对比度。

`0.5.0` 增加了官方 Windows Desktop `0.2.0-rc.2` 的兼容声明；原 Whale Desktop 的 `0.1.5-rc.1` 以及更早的 peer 范围继续保留。官方新版仍提供主题注册、通用设置和会话标题槽位。桌面端安装使用应用内的“插件 → 添加插件”，选择本目录打出的安装包。已在官方 Desktop `0.2.0-rc.2` 实测鲸雾/鲸渊切换、设置项、会话与输入卡片，以及配合 `dsh-reasoning-effort` `0.8.0` 的 Off/High 滑块样式。

`0.5.2` 为官方 Windows Desktop 增加透明白鲸运行时图标。单改 `.lnk`
不能保证运行中的任务栏图标变化，因此插件启动时会为官方壳进程的窗口设置
大小图标和 Windows 任务栏重启图标属性，保留 `com.deepseek.dsh` 身份。
官方 EXE、签名和 `app.asar` 保持原样。Windows 原生辅助程序随 Host 退出，
插件停用时恢复窗口的原始图标与属性；浏览器、WSL 和原 Tauri 版本不会启动它。
辅助程序源码在 `src/windows/WhaleDesktopIcon.cs`；在 Windows 上运行
`npm run build:desktop-icon` 编译并验证真实窗口的设置/还原，再运行 `npm pack`。

## 回归检查

在正式 `3080` 服务运行时执行：

```powershell
node qa/official-regression.mjs
```

脚本会用真实鼠标验证侧栏展开/收起/再展开、鲸雾/鲸渊切换与主题恢复，打开一个
已有会话，确认输入卡片是不透明覆盖表面，并进入独立的 Trajectory 视图。
