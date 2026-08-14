# Whale Mist / 鲸雾蓝 — 界面原型

> PROTOTYPE：用于选择 DeepSeek Harness `dsh.client` 主题的信息层级，不是生产代码。

原型结论：采用 A「港湾」作为唯一方向，并严格保留官方 Web UI 的信息架构。

## 预览

双击 `预览鲸雾蓝.cmd`，浏览器会打开原型。

页面包含两个与官方一致的独立视图：

- `/?page=conversation`（或根地址）：对话页。
- `/?page=trajectory`：轨迹页。

B、C 和原型切换器已经移除。当前阶段继续验证 A 的字体、间距和交互，确认后再重写为正式 `dsh.client` 插件。

## 当前验证

- 侧栏“收起后无法再次展开”已修复。
- `qa/sidebar-regression.mjs` 会用真实浏览器指针验证“展开 → 收起 → 展开”完整往返。
- 正式插件的数据、主题和插槽接入边界见 `INTERFACE-MAP.md`。
