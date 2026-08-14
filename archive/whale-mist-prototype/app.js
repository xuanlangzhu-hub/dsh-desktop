/*
 * PROTOTYPE — Whale Mist / 鲸雾蓝
 * Winner: A. The official Web UI information architecture is preserved while
 * the visual system is replaced with a restrained blue material language.
 */

const icon = (name, className = "") =>
  `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const whale = `<img src="./assets/whale.png" alt="" />`;

let sidebarCompact = false;
let toastTimer;

const traceEvents = [
  { kind: "assistant", label: "ASSISTANT", action: "分析界面结构", detail: "确认工作区、会话页签、输入区与运行统计的层级" },
  { kind: "tool", label: "TOOL", action: "read", detail: "读取官方 Web UI 截图与会话结构" },
  { kind: "tool", label: "TOOL", action: "grep", detail: "检查现有字体尺寸、行高与间距令牌" },
  { kind: "assistant", label: "ASSISTANT", action: "排版结论", detail: "采用 4px 基线；正文 14/24；控件 13/20；标题 15/24" },
  { kind: "tool", label: "TOOL", action: "read", detail: "F:\\deepseekharness\\whale-mist-prototype\\styles.css" },
  { kind: "tool", label: "TOOL", action: "apply_patch", detail: "移除 B、C 与原型切换器，重写唯一 A 方案" },
  { kind: "assistant", label: "ASSISTANT", action: "结构确认", detail: "Trajectory 作为会话内部独立页面，不占用对话布局" },
  { kind: "tool", label: "TOOL", action: "render", detail: "渲染桌面与窄屏视觉快照" },
  { kind: "assistant", label: "ASSISTANT", action: "完成", detail: "Whale Mist A 已与官方信息架构对齐" },
];

function sidebar() {
  return `
    <aside class="sidebar" aria-label="工作区导航">
      <div class="brand-row">
        <div class="brand-lockup">
          <span class="brand-mark">${whale}</span>
          <span class="brand-word">deepseek</span>
          <span class="brand-badge">HARNESS</span>
        </div>
        <button class="icon-button sidebar-toggle" data-action="toggle-sidebar" aria-label="${sidebarCompact ? "展开侧边栏" : "收起侧边栏"}" aria-expanded="${String(!sidebarCompact)}">${icon("panel")}</button>
      </div>

      <button class="new-session" data-action="new-session">
        ${icon("circle-plus")}
        <span>新会话</span>
      </button>

      <div class="workspace-heading">
        <span class="workspace-label">工作区</span>
        <div class="workspace-actions">
          <button class="icon-button" data-action="focus-search" aria-label="搜索会话">${icon("search")}</button>
          <button class="icon-button" data-action="filter" aria-label="筛选工作区">${icon("sliders")}</button>
          <button class="icon-button" data-action="new-workspace" aria-label="新建工作区">${icon("folder")}<span class="corner-plus">+</span></button>
        </div>
      </div>

      <label class="workspace-search">
        ${icon("search", "sm")}
        <input type="search" placeholder="搜索会话" aria-label="搜索会话" />
      </label>

      <div class="workspace-tree">
        <button class="project-row" aria-expanded="true">
          ${icon("folder")}
          <span class="project-name">deepseekharness</span>
          ${icon("chevron", "sm project-chevron")}
        </button>
        <div class="project-sessions">
          <button class="workspace-session active" data-session="theme">
            <span class="session-title">设计 Whale Mist 主题</span>
            <span class="session-time">刚刚</span>
            <span class="session-more">${icon("more", "sm")}</span>
          </button>
          <button class="workspace-session" data-session="plugin">
            <span class="session-title">分析插件加载链路</span>
            <span class="session-time">42分</span>
            <span class="session-more">${icon("more", "sm")}</span>
          </button>
        </div>
      </div>

      <div class="sidebar-spacer"></div>

      <button class="settings-row" data-action="settings">
        ${icon("settings")}
        <span>设置</span>
      </button>
    </aside>`;
}

function sessionHeader(page) {
  return `
    <header class="session-header">
      <div class="session-titlebar">
        <button class="icon-button mobile-menu" data-action="mobile-menu" aria-label="打开侧边栏">${icon("menu")}</button>
        <div class="session-heading">设计 Whale Mist 主题</div>
        <button class="mode-label" data-action="mode">${icon("branch", "sm")}<span>标准模式</span></button>
        <div class="header-spacer"></div>
        <button class="session-log" data-action="session-log"><span>Session log</span>${icon("download", "sm")}</button>
      </div>
      <nav class="session-tabs" aria-label="会话视图">
        <button class="session-tab ${page === "conversation" ? "active" : ""}" data-page="conversation">对话</button>
        <button class="session-tab ${page === "trajectory" ? "active" : ""}" data-page="trajectory">轨迹</button>
      </nav>
    </header>`;
}

function activityRow(type, iconName, content, detail = "") {
  return `
    <div class="activity-row">
      <span class="activity-icon">${icon(iconName, "sm")}</span>
      <span class="activity-type">${type}</span>
      <span class="activity-separator">·</span>
      <span class="activity-content">${content}</span>
      ${detail ? `<span class="activity-detail">${detail}</span>` : ""}
    </div>`;
}

function conversationPage() {
  return `
    <div class="conversation-scroll" id="conversation-scroll">
      <main class="conversation-feed" aria-label="对话内容">
        <div class="user-turn">
          <div class="user-message">和官方对齐，再仔细校正字体排版；只保留 A，轨迹放到单独界面。</div>
        </div>

        <section class="assistant-turn">
          ${activityRow("Think", "spark", "先按官方 Web UI 重新确认页面层级与文字基线")}
          ${activityRow("Read", "terminal", "查看用户提供的 5 张官方界面截图", "2048 × 957")}
          ${activityRow("Think", "spark", "信息架构已经确认：工作区 → 会话 → 对话 / 轨迹")}

          <p class="assistant-copy">这次不再把主题理解成单纯换色。官方界面中，<strong>轨迹是会话的独立页签</strong>；侧边栏先展示工作区，再在项目下列出会话。输入框底部同时承担权限、模型、运行状态和统计信息。</p>

          ${activityRow("Grep", "search", "font-size | line-height | letter-spacing", "styles.css")}
          ${activityRow("Read", "terminal", "检查 A 版的侧栏会话项和输入框布局")}

          <p class="assistant-copy">排版统一到 4px 基线：页面标题使用 15/24，正文使用 14/24，控件与活动记录使用 13/20，辅助文字使用 12/16。图标和文字始终共享同一条中心线，不再用第二行模型信息挤乱会话标题。</p>

          ${activityRow("Patch", "code", "重写唯一 A 方案并拆分 Trajectory 页面")}
          ${activityRow("Render", "eye", "检查桌面与窄屏画面", "进行中")}

          <div class="run-state"><span>Deep diving...</span><span>2分33秒</span></div>
        </section>
      </main>
    </div>`;
}

function timelineStrip() {
  const rows = [
    ["input", [1, 2, 8, 20, 28, 29, 36, 41]],
    ["model", [3, 5, 7, 9, 12, 13, 17, 22, 25, 30, 33, 38, 43, 45]],
    ["tools", [4, 6, 10, 11, 14, 15, 18, 19, 23, 24, 27, 31, 32, 35, 39, 40, 44, 47]],
  ];
  return `<div class="timeline-strip" aria-label="轨迹概览">
    ${rows.map(([name, active]) => `
      <div class="timeline-row">
        <span class="timeline-label">${name === "input" ? "输入" : name === "model" ? "模型" : "工具"}</span>
        <span class="timeline-cells">${Array.from({ length: 48 }, (_, index) => `<i class="timeline-cell ${active.includes(index) ? `on ${name}` : ""}"></i>`).join("")}</span>
      </div>`).join("")}
  </div>`;
}

function trajectoryPage() {
  return `
    <section class="trajectory-page" aria-label="运行轨迹">
      <div class="trajectory-toolbar">
        <div class="trajectory-metrics">
          <button class="metric active">${icon("clock", "sm")}<span>Duration</span></button>
          <button class="metric">${icon("grid", "sm")}<span>Turns</span></button>
          <button class="metric">${icon("terminal", "sm")}<span>Calls</span></button>
        </div>
        <label class="trajectory-search">${icon("search", "sm")}<input type="search" placeholder="搜索轨迹" aria-label="搜索轨迹" /></label>
      </div>
      ${timelineStrip()}
      <div class="trace-scroll">
        <div class="trace-list">
          ${traceEvents.map((event, index) => `
            <div class="trace-row" data-search="${event.label} ${event.action} ${event.detail}">
              <span class="trace-rail">${index % 3 === 1 ? "<i></i>" : ""}</span>
              <span class="trace-badge ${event.kind}">${event.label}</span>
              <span class="trace-action">${event.action}</span>
              <span class="trace-detail">${event.detail}</span>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function composer() {
  return `
    <div class="composer-dock">
      <form class="composer" id="composer-form">
        <textarea id="composer-input" rows="1" placeholder="给智能体发消息" aria-label="给智能体发消息"></textarea>
        <div class="composer-controls">
          <button type="button" class="composer-icon" data-action="attach" aria-label="添加内容">${icon("plus")}</button>
          <button type="button" class="access-button" data-action="access">${icon("shield", "sm")}<span>Full access</span>${icon("chevron", "sm")}</button>
          <div class="control-spacer"></div>
          <button type="button" class="model-selector" data-action="model"><span>DeepSeek-V3.2</span>${icon("chevron", "sm")}</button>
          <span class="run-indicator" aria-label="空闲"></span>
          <button class="send-button" type="submit" aria-label="发送">${icon("arrow-up")}</button>
        </div>
      </form>
      <div class="session-stats" aria-label="本轮运行统计">
        <span>7 轮 · 58 步</span><i></i><span>LLM 7m2s · 工具调用 4m16s</span><i></i><span>首 token 平均 1.3s · 118 tok/s</span><i></i><span>缓存命中 98%</span><i></i><span>输入 2.9M tok · 输出 41.3K</span>
      </div>
    </div>`;
}

function currentPage() {
  return new URLSearchParams(location.search).get("page") === "trajectory" ? "trajectory" : "conversation";
}

function appTemplate() {
  const page = currentPage();
  return `
    <div class="app-shell ${sidebarCompact ? "sidebar-compact" : ""}">
      ${sidebar()}
      <section class="main-panel">
        ${sessionHeader(page)}
        <div class="page-stage">
          ${page === "trajectory" ? trajectoryPage() : conversationPage()}
          ${composer()}
        </div>
      </section>
      <button class="mobile-scrim" data-action="close-mobile" aria-label="关闭侧边栏"></button>
    </div>
    <div class="toast" role="status">${icon("check", "sm")}<span></span></div>`;
}

function setPage(page) {
  const url = new URL(location.href);
  if (page === "conversation") url.searchParams.delete("page");
  else url.searchParams.set("page", page);
  history.replaceState({}, "", url);
  render();
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.querySelector("span").textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1600);
}

function addConversationMessage(text) {
  const feed = document.querySelector(".conversation-feed");
  if (!feed) {
    setPage("conversation");
    requestAnimationFrame(() => addConversationMessage(text));
    return;
  }
  const turn = document.createElement("div");
  turn.className = "user-turn added-turn";
  const message = document.createElement("div");
  message.className = "user-message";
  message.textContent = text;
  turn.appendChild(message);
  feed.appendChild(turn);
  const response = document.createElement("p");
  response.className = "assistant-copy added-turn";
  response.textContent = "这是原型中的即时反馈；正式插件阶段会把这里连接到 Harness 会话事件流。";
  feed.appendChild(response);
  document.querySelector("#conversation-scroll")?.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
}

function wireInteractions() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  const shell = document.querySelector(".app-shell");
  document.querySelectorAll('[data-action="toggle-sidebar"]').forEach(button => button.addEventListener("click", () => {
    if (matchMedia("(max-width: 800px)").matches) shell.classList.remove("mobile-open");
    else {
      sidebarCompact = !sidebarCompact;
      shell.classList.toggle("sidebar-compact", sidebarCompact);
      button.setAttribute("aria-label", sidebarCompact ? "展开侧边栏" : "收起侧边栏");
      button.setAttribute("aria-expanded", String(!sidebarCompact));
    }
  }));
  document.querySelectorAll('[data-action="mobile-menu"]').forEach(button => button.addEventListener("click", () => shell.classList.add("mobile-open")));
  document.querySelectorAll('[data-action="close-mobile"]').forEach(button => button.addEventListener("click", () => shell.classList.remove("mobile-open")));

  const search = document.querySelector(".workspace-search input");
  document.querySelector('[data-action="focus-search"]')?.addEventListener("click", () => {
    document.querySelector(".workspace-search").classList.add("visible");
    search.focus();
  });
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("zh-CN");
    document.querySelectorAll(".workspace-session").forEach(item => {
      item.hidden = Boolean(query) && !item.textContent.toLocaleLowerCase("zh-CN").includes(query);
    });
  });

  document.querySelectorAll(".workspace-session").forEach(item => item.addEventListener("click", () => {
    document.querySelectorAll(".workspace-session").forEach(session => session.classList.remove("active"));
    item.classList.add("active");
    showToast("已切换会话预览");
  }));

  const traceSearch = document.querySelector(".trajectory-search input");
  traceSearch?.addEventListener("input", () => {
    const query = traceSearch.value.trim().toLocaleLowerCase("zh-CN");
    document.querySelectorAll(".trace-row").forEach(row => {
      row.hidden = Boolean(query) && !row.dataset.search.toLocaleLowerCase("zh-CN").includes(query);
    });
  });

  const form = document.querySelector("#composer-form");
  const input = document.querySelector("#composer-input");
  input?.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  });
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    input.value = "";
    input.style.height = "auto";
    addConversationMessage(value);
  });

  const messages = {
    "new-session": "已准备新会话",
    filter: "筛选入口将在插件阶段接入",
    "new-workspace": "新建工作区入口",
    settings: "设置入口",
    mode: "当前为标准模式",
    "session-log": "Session log 导出入口",
    attach: "添加内容入口",
    access: "当前权限：Full access",
    model: "当前模型：DeepSeek-V3.2",
  };
  Object.entries(messages).forEach(([action, message]) => {
    document.querySelectorAll(`[data-action="${action}"]`).forEach(button => button.addEventListener("click", () => {
      if (action === "new-session") input?.focus();
      showToast(message);
    }));
  });
}

function render() {
  document.querySelector("#app").innerHTML = appTemplate();
  wireInteractions();
}

window.addEventListener("popstate", render);
render();
