# Whale Appearance / 鲸系外观

DeepSeek Harness Web UI 的一组可安装主题，包含浅色 `Whale Mist / 鲸雾` 与
深色 `Whale Abyss / 鲸渊`。它使用官方 `ctx.theme`、Settings
扩展槽位和公开 `--dsw-*` 设计令牌，保留官方侧栏、工作区、会话、输入框、
审批、问题和 Trajectory 的数据与交互。

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
- 标题旁的白鲸只在 Agent 运行、等待确认或刚刚完成时出现，状态直接来自官方会话快照。
- 系统字体栈与明确行高保持中文排版稳定。
- 高频交互没有装饰性进场动画；按钮只有 120ms 的按压反馈。
- 可选的 `dsh-reasoning-effort` 在鲸雾下使用蓝白静态轨道，已激活区域以淡紫—深紫波浪表达强度；鲸渊保留插件原版深色紫色辐射效果。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency` 和高对比度。

当前兼容目标为 Windows fallback 的 DeepSeek Harness `0.1.0-rc.6` 与 WSL2 runtime 的 `0.1.1-rc.2`。

## 回归检查

在正式 `3080` 服务运行时执行：

```powershell
node qa/official-regression.mjs
```

脚本会用真实鼠标验证侧栏展开/收起/再展开、鲸雾/鲸渊切换与主题恢复，打开一个
已有会话，确认输入卡片是不透明覆盖表面，并进入独立的 Trajectory 视图。
