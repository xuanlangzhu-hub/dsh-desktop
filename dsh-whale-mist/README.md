# Whale Mist / 鲸雾蓝

DeepSeek Harness Web UI 的可安装浅色主题。它使用官方 `ctx.theme`、Settings
扩展槽位和公开 `--dsw-*` 设计令牌，保留官方侧栏、工作区、会话、输入框、
审批、问题和 Trajectory 的数据与交互。

## 安装

在本目录的上一级运行：

```powershell
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-whale-mist
```

重新启动 `npx --yes @deepseek-ai/dsh web` 后即可使用。插件启动时会激活
`whale-mist`；设置页的外观选择器里仍可临时切换回官方浅色或深色主题。

## 设计原则

- 淡蓝渐变画布，侧栏与会话面保持轻微明度差。
- 玻璃只用于分层表面；长会话上方的输入卡片使用不透明渐变，滚动文字不会穿透。
- 官方“设置 → 通用”中提供背景层次、侧栏层次和玻璃强度三个简洁选项；选择保存在本机浏览器。
- 标题旁的白鲸只在 Agent 运行、等待确认或刚刚完成时出现，状态直接来自官方会话快照。
- 系统字体栈与明确行高保持中文排版稳定。
- 高频交互没有装饰性进场动画；按钮只有 120ms 的按压反馈。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency` 和高对比度。

当前兼容目标锁定 DeepSeek Harness `0.1.0-rc.6`。

## 回归检查

在正式 `3080` 服务运行时执行：

```powershell
node qa/official-regression.mjs
```

脚本会用真实鼠标验证侧栏展开/收起/再展开，打开一个已有会话，确认输入卡片
是不透明覆盖表面，并进入独立的 Trajectory 视图。两张截图保存在 `qa/`。
