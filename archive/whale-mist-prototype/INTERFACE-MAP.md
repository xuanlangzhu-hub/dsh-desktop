# Whale Mist × DeepSeek Harness 接口对齐图

## 结论

Whale Mist 不应自己请求 `/api`、复制 SSE 或重建会话状态机。正式版本应作为 `dsh.client` Web 插件运行在官方客户端里：

- 颜色、字体和基础阴影通过官方 `ctx.theme` 注册。
- 第一版保留官方 `sidebar` 外壳，并通过主题令牌驱动其真实工作区与会话界面。
- 对话、审批、问题、模型选择、附件、队列和 Trajectory 继续复用官方插件。
- 会话列表、工作区、聊天和轨迹都读取官方 Runtime 的快照；写操作调用 Runtime 的公开行为方法。

这样既能得到 Whale Mist 外观，也保留官方的断线重连、历史分页、会话恢复、审批和插件卸载语义。

当前本机 npm 包版本是 `0.1.0-rc.6`。官方仍标记为 Developer Preview，因此实现时要锁定所有 `@deepseek-ai/*` 依赖的精确版本，并把升级验证当作发布步骤。

## 数据与行为边界

| 界面区域 | 正式数据源 / 行为 | Whale Mist 的职责 |
| --- | --- | --- |
| 主题 | `ctx.theme.register()`、`ctx.theme.overrideTokens()` | 注册 `whale-mist` 主题；覆盖公开 `--dsw-alias-*` token，不覆盖哈希类名 |
| 侧栏折叠 | `ctx.layout.toggleSidebar()`；官方 `sidebar` owner 的 `collapsed`、`width` | 第一版复用官方 56px rail，并回归验证折叠后展开按钮始终可命中 |
| 会话列表 | `useSessions` / `ctx.sessions.list` | 显示 `displayTitle`、`running`、`pendingInteraction`、`completed`、`updatedAt`；点击调用 `ctx.sessions.open(id)` |
| 会话搜索 | `ctx.sessions.search(query, signal)` | 只管理搜索输入与取消；不把搜索结果混入会话列表真值 |
| 工作区 | `useWorkspaces` / `ctx.workspaces.list` | 显示官方排序与归档结果；新增会话调用 `ctx.workspaces.startSession(workspaceId?)` |
| 当前对话 | `useSession` 的 `ConversationSnapshot` | 读取 `chat.order`、`chat.nodes`、`partial`、`runningCalls`、`queue`、`pending`、`running` 和打开状态 |
| 发送 / 停止 | Session Face 的 `prompt(parts, mode)`、`cancel()` | 输入层只做交互与错误呈现；不自行构造 RPC |
| 历史分页 | Session Face 的 `loadOlder()`；快照中的 `hasMore`、`loadingOlder` | 保留官方分页触发与加载状态 |
| 附件 | Session Face 的 `readAttachment()`；官方 Conversation 的图片上传和解析 | 第一版直接复用官方 composer 与消息渲染 |
| 审批 / 问题 | `ConversationSnapshot.pending` 与官方 `ui-user-questions` / approval composer | 不重写响应编码和生命周期，只调主题 |
| 轨迹 | `useSession(s => s.views.get('trajectory'))` | 轨迹是会话内独立 tab；不另调“轨迹 API” |

## Trajectory 为什么不需要新接口

官方 `ui-trajectory` 把 `conversation.view` 注册为 `id: "trajectory"`。它与 Chat 共用同一个 append-only 会话事件窗口，再由 Runtime 的 `ConversationViewSnapshotStore` 投影出：

- `eventNodes`
- `eventLocations`
- `requests`
- `callSchemas`
- `partial`
- `runningCalls`

因此对话和轨迹必须共享同一个 `useSession` 快照。历史向前分页仍调用同一个 `loadOlder()`，切换 tab 不应创建第二条连接或复制事件缓存。

## 插槽策略

### 第一阶段：稳定且低耦合

1. 注册 `whale-mist` 主题，映射背景、分层表面、侧栏、边框、文字、品牌色、悬停和阴影 token。
2. 保留官方 `sidebar` 注册项以及它声明的三个内部槽位：
   - `sidebar.workspaces`
   - `sidebar.settings`
   - `sidebar.footer.action`
3. 通过 `--dsw-specific-sidebar-*`、背景、边框、文字和交互令牌把真实侧栏改成 Whale Mist。
4. 保留官方 `conversation`、`conversation.session`、`conversation.composer.bar`、`details` 和 `conversation.view`。

这一阶段已经能把原型的淡蓝层级、侧栏明度差、玻璃表面和官方功能组合起来，同时不触碰最复杂的输入与消息状态机。

### 为什么第一版不覆盖 `sidebar`

官方 slot 的遮蔽不是“后注册者获胜”，而是同一 cell 中 `priority` 更低者获胜；同优先级会直接报错。更关键的是，父项声明子槽位是独占行为：官方侧栏已经声明 `sidebar.workspaces`、`sidebar.settings` 和 `sidebar.footer.action`，第二个外壳不能再次声明它们。与此同时，官方 Workspace 和 Settings 客户端包又显式依赖 `@deepseek-ai/dsh-client-ui-sidebar` 的装配顺序。

因此，要完整换掉侧栏外壳，需要一次真正的程序集成：替换同名 Sidebar 客户端包、重新声明内部槽位，并对 Workspace/Settings 依赖做整套兼容验证。这适合作为后续独立版本，不应该混进第一版主题 MVP。

### 第二阶段：只做加法

使用已有 list/chain slot 增加 Whale Mist 元素，不替换父级：

- `conversation.session.header.actions`
- `conversation.session.header.utilities`
- `conversation.input.left`
- `conversation.input.right`
- `conversation.input.dock`
- `conversation.composer.dock`
- `shell.overlay`

### 暂不替换

- `root`
- `conversation`
- `conversation.session`
- `conversation.composer.bar`
- `conversation.chat.node`

这些 seat 自己声明大量子插槽或拥有草稿、审批、图片、队列与视图切换状态。直接遮蔽会把对应子树一起拿掉；除非后续确认公开契约足够，否则保持官方实现。

## 插件包骨架

正式包使用双入口：Node loader 入口和浏览器 `./client` 入口，并由 bundle patch 插入 Web profile。当前已落地为零构建步骤的本地包：

```text
dsh-whale-mist/
├── package.json
├── cordis.patch.yml
├── src/index.js          # Node loader face
├── src/client.js         # 官方模块加载器包装 + ctx.theme
└── qa/official-regression.mjs
```

包清单的关键字段：

```json
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-theme",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  },
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js"
  }
}
```

本地安装路线：

```text
dsh plugin --profile web add ./dsh-whale-mist
dsh --profile web --dump-config
dsh web
```

在当前只通过 npm 使用 CLI 的机器上，把 `dsh` 替换成 `npx @deepseek-ai/dsh` 即可。

## 回归门槛

- 侧栏：真实指针点击“展开 → 收起 → 展开”，按钮始终可命中；主题令牌在三个状态中保持不变。
- 会话：切换、创建、重命名、归档、搜索、刷新后恢复。
- 对话：发送、steer、queue、停止、长会话分页、图片附件；底部输入卡片必须是不透明覆盖表面，滚动正文不可穿透。
- 人机交互：审批、用户问题、Plan review 不被自定义壳层遮挡。
- 轨迹：独立 tab、搜索、时间线、tool inspect、加载更早事件；与对话页共用同一个不透明输入卡片。
- 视口：桌面、窄屏、移动抽屉；`prefers-reduced-motion`。
- 升级：每次 Harness 版本变化先检查 `dsh.client.inject`、SlotMap 和 Runtime 公共类型，再运行全部交互回归。

## 官方依据

- [DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.zh.md)
- [打包与安装插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)
