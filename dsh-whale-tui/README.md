# Whale TUI / 鲸雾终端

DeepSeek Harness 的直接终端界面。它作为独立 `tui` Profile 运行在
`dsh-base` 之上，不启动 Web Server，也不依赖浏览器。

## 安装

```powershell
npx --yes @deepseek-ai/dsh plugin --profile tui add ./dsh-whale-tui
```

## 启动

直接双击工作区根目录中的以下任一入口：

- `DeepSeek Harness TUI.lnk`：新建会话
- `DeepSeek Harness TUI - 继续上次.lnk`：恢复最近会话

也可以从终端启动：

```powershell
npx --yes @deepseek-ai/dsh --profile tui
```

恢复指定会话：

```powershell
npx --yes @deepseek-ai/dsh --profile tui --resume <session-id>
```

## 交互

- `Enter`：发送；Agent 运行中再次发送会作为 steering
- `Esc`：停止当前任务
- `Ctrl+C`：运行中停止，空闲时保存并退出
- `PageUp` / `PageDown`：滚动对话
- `Tab`：在简洁对话与完整轨迹之间切换
- `Ctrl+R` 或 `/sessions`：打开可搜索的全屏会话选择器
- `/resume <session-id>`：恢复会话
- `/new`：新建会话
- `/model [provider model reasoning]`：查看或切换模型
- `/clear`、`/help`、`/exit`

审批与 Harness 问题会直接占用底部输入行，并显示清晰的选择提示。
对话视图只保留用户消息、最终回答和必要提示；轨迹视图会额外展示轮次、步骤、推理、模型路由和工具调用结果。

## 验证

```powershell
npm run check
npx --yes @deepseek-ai/dsh --profile tui --check
npx --yes @deepseek-ai/dsh --profile tui --snapshot
```

TUI 复用 Web Profile 已保存的模型凭据和 `$DSH_HOME/sessions` 会话目录。
当前兼容目标锁定 DeepSeek Harness `0.1.0-rc.6`。
