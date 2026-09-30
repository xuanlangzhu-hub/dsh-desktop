window.__ModuleLoader__.load({
  id: "dsh-whale-mist",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { FishLogo } = require("@deepseek-ai/dsh-client-ui-primitives");

    const THEME_ID = "whale-mist";
    const ABYSS_THEME_ID = "whale-abyss";
    const ACTIVE_CLASS = "dsh-whale-mist-active";
    const ABYSS_ACTIVE_CLASS = "dsh-whale-abyss-active";
    const THEME_IDS = Object.freeze({ mist: THEME_ID, abyss: ABYSS_THEME_ID });
    const MANAGED_THEME_IDS = new Set(Object.values(THEME_IDS));
    const STYLE_ID = "dsh-whale-mist/theme.css";
    const STORAGE_KEY = "dsh-whale-mist.appearance.v1";
    const DEFAULT_SETTINGS = Object.freeze({
      theme: "abyss",
      canvas: "soft",
      sidebar: "balanced",
      glass: "standard"
    });
    const ALLOWED_SETTINGS = Object.freeze({
      theme: Object.freeze(["mist", "abyss"]),
      canvas: Object.freeze(["soft", "clear"]),
      sidebar: Object.freeze(["balanced", "deep"]),
      glass: Object.freeze(["standard", "restrained"])
    });

    function normalizeSettings(value) {
      const source = value && typeof value === "object" ? value : {};
      return Object.fromEntries(Object.entries(ALLOWED_SETTINGS).map(([key, allowed]) => [
        key,
        allowed.includes(source[key]) ? source[key] : DEFAULT_SETTINGS[key]
      ]));
    }

    function readSettings() {
      try {
        return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }

    function persistSettings(settings) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {}
    }

    function projectSettings(settings) {
      document.body.dataset.wmTheme = settings.theme;
      document.body.dataset.wmCanvas = settings.canvas;
      document.body.dataset.wmSidebar = settings.sidebar;
      document.body.dataset.wmGlass = settings.glass;
    }

    function selectedThemeId(settings) {
      return THEME_IDS[settings.theme] ?? ABYSS_THEME_ID;
    }

    function createBooleanSignal(initialValue = false) {
      let value = initialValue;
      const listeners = new Set();
      return Object.freeze({
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        set: (nextValue) => {
          if (value === nextValue) return;
          value = nextValue;
          listeners.forEach((listener) => listener());
        }
      });
    }

    const theme = Object.freeze({
      id: THEME_ID,
      colorScheme: "light",
      tokens: Object.freeze({
        "--dsw-alias-bg-base": "rgba(239, 247, 254, 0.78)",
        "--dsw-alias-bg-primary": "rgba(247, 251, 255, 0.7)",
        "--dsw-alias-bg-layer-1": "rgba(255, 255, 255, 0.62)",
        "--dsw-alias-bg-layer-2": "rgba(230, 242, 251, 0.7)",
        "--dsw-alias-bg-layer-3": "rgba(252, 254, 255, 0.78)",
        "--dsw-alias-bg-overlay": "rgba(248, 252, 255, 0.86)",
        "--dsw-alias-bg-mask-1": "rgba(11, 44, 67, 0.16)",
        "--dsw-alias-bg-module-platform": "rgba(218, 235, 249, 0.58)",

        "--dsw-alias-border-l1": "rgba(255, 255, 255, 0.78)",
        "--dsw-alias-border-l2": "rgba(54, 101, 136, 0.16)",
        "--dsw-alias-border-l2-darkmode-thin": "rgba(54, 101, 136, 0.18)",
        "--dsw-alias-border-l3": "rgba(54, 101, 136, 0.23)",
        "--dsw-alias-border-l4": "rgba(36, 77, 107, 0.32)",
        "--dsw-alias-border-secondary": "rgba(54, 101, 136, 0.18)",
        "--dsw-alias-border-inverted": "rgba(255, 255, 255, 0.72)",
        "--dsw-alias-line-secondary": "rgba(54, 101, 136, 0.14)",
        "--dsw-alias-separator-primary": "rgba(54, 101, 136, 0.13)",

        "--dsw-alias-label-primary": "#153047",
        "--dsw-alias-label-primary-bluish": "#163b57",
        "--dsw-alias-label-primary-foreground": "#0a263d",
        "--dsw-alias-label-secondary": "#62798c",
        "--dsw-alias-label-tertiary": "#8094a5",
        "--dsw-alias-label-quaternary": "#9aabba",
        "--dsw-alias-label-caption": "#6f879a",
        "--dsw-alias-label-dimmed": "#8da0af",
        "--dsw-alias-label-primary-dimmed": "#7890a2",
        "--dsw-alias-label-inverse": "#f8fcff",
        "--dsw-alias-label-error": "#b14754",

        "--dsw-alias-brand-primary": "#1468a8",
        "--dsw-alias-brand-primary-new-colorprimary-new-color": "#1468a8",
        "--dsw-alias-button-primary-fill": "#1468a8",
        "--dsw-alias-button-primary-hover": "#0f5e97",
        "--dsw-alias-button-info-fill": "rgba(20, 104, 168, 0.12)",
        "--dsw-alias-button-info-hover": "rgba(20, 104, 168, 0.18)",
        "--dsw-alias-button-elevated-fill": "rgba(255, 255, 255, 0.58)",
        "--dsw-alias-button-floating-fill": "rgba(252, 254, 255, 0.74)",
        "--dsw-alias-button-floating-hover": "rgba(255, 255, 255, 0.9)",
        "--dsw-alias-button-ghost-active-fill": "rgba(33, 128, 193, 0.15)",

        "--dsw-alias-interactive-bg-primary": "rgba(33, 128, 193, 0.12)",
        "--dsw-alias-interactive-bg-hover": "rgba(33, 128, 193, 0.09)",
        "--dsw-alias-interactive-bg-active": "rgba(33, 128, 193, 0.15)",
        "--dsw-alias-interactive-bg-hover-solid": "#e6f2fb",
        "--dsw-alias-interactive-bg-hover-danger": "rgba(184, 72, 84, 0.1)",
        "--dsw-alias-fill-l2": "rgba(89, 133, 165, 0.14)",
        "--dsw-alias-fill-tsp-secondary": "rgba(255, 255, 255, 0.44)",

        "--dsw-alias-scrollbar-bg-l2": "rgba(62, 105, 136, 0.2)",
        "--dsw-alias-scrollbar-hover-l2": "rgba(48, 90, 121, 0.32)",
        "--dsw-alias-markdown-citation": "#1468a8",
        "--dsw-alias-markdown-code-block": "rgba(223, 237, 248, 0.72)",
        "--dsw-alias-markdown-code-block-banner": "rgba(213, 231, 245, 0.84)",

        "--dsw-alias-state-business-primary": "#1468a8",
        "--dsw-alias-state-business-tertiary": "rgba(20, 104, 168, 0.13)",
        "--dsw-alias-state-success-primary": "#2b8164",
        "--dsw-alias-state-success-tertiary": "rgba(43, 129, 100, 0.12)",
        "--dsw-alias-state-warn-primary": "#a96a22",
        "--dsw-alias-state-warn-secondary": "#bd7e35",
        "--dsw-alias-state-warn-tertiary": "rgba(169, 106, 34, 0.12)",
        "--dsw-alias-state-warn-label": "#87541b",
        "--dsw-alias-state-error-primary": "#b14754",
        "--dsw-alias-state-error-secondary": "#c35a66",

        "--dsw-font-family": "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        "--dsw-font-mono": "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
        "--dsw-mask-blur": "blur(24px) saturate(132%)",
        "--dsw-shadow-lv1": "0 1px 2px rgba(36, 76, 106, 0.06), 0 5px 16px rgba(45, 91, 124, 0.06)",
        "--dsw-shadow-lv2": "0 1px 2px rgba(36, 76, 106, 0.07), 0 15px 40px rgba(45, 91, 124, 0.11)",
        "--dsw-shadow-lv3": "0 3px 8px rgba(36, 76, 106, 0.08), 0 28px 70px rgba(45, 91, 124, 0.16)",

        "--dsw-specific-sidebar-fill": "rgba(220, 237, 250, 0.76)",
        "--dsw-specific-sidebar-nav-item-active": "rgba(255, 255, 255, 0.64)",
        "--dsw-specific-sidebar-nav-item-active-accent": "#4aa4dd",
        "--dsw-specific-sidebar-nav-item-hover": "rgba(255, 255, 255, 0.46)",
        "--dsw-specific-input-major": "linear-gradient(180deg, #fbfdff 0%, #f4f9fd 100%)",
        "--dsw-specific-bubble": "rgba(210, 233, 250, 0.68)",
        "--dsw-specific-menu": "rgba(249, 252, 255, 0.88)",
        "--dsw-specific-selector": "rgba(255, 255, 255, 0.66)",
        "--dsw-specific-tip": "rgba(238, 247, 254, 0.9)"
      })
    });

    const abyssTheme = Object.freeze({
      id: ABYSS_THEME_ID,
      colorScheme: "dark",
      tokens: Object.freeze({
        "--dsw-alias-bg-base": "#080b14",
        "--dsw-alias-bg-primary": "#0b111d",
        "--dsw-alias-bg-layer-1": "rgba(15, 23, 38, 0.94)",
        "--dsw-alias-bg-layer-2": "rgba(23, 34, 54, 0.92)",
        "--dsw-alias-bg-layer-3": "rgba(28, 40, 62, 0.96)",
        "--dsw-alias-bg-overlay": "rgba(23, 34, 54, 0.98)",
        "--dsw-alias-bg-mask-1": "rgba(2, 5, 12, 0.68)",
        "--dsw-alias-bg-module-platform": "rgba(20, 30, 48, 0.9)",

        "--dsw-alias-border-l1": "rgba(231, 236, 245, 0.06)",
        "--dsw-alias-border-l2": "rgba(125, 145, 177, 0.16)",
        "--dsw-alias-border-l2-darkmode-thin": "rgba(125, 145, 177, 0.13)",
        "--dsw-alias-border-l3": "rgba(125, 145, 177, 0.23)",
        "--dsw-alias-border-l4": "rgba(151, 168, 194, 0.32)",
        "--dsw-alias-border-secondary": "rgba(125, 145, 177, 0.18)",
        "--dsw-alias-border-inverted": "rgba(231, 236, 245, 0.14)",
        "--dsw-alias-line-secondary": "rgba(125, 145, 177, 0.13)",
        "--dsw-alias-separator-primary": "rgba(125, 145, 177, 0.12)",

        "--dsw-alias-label-primary": "#e7ecf5",
        "--dsw-alias-label-primary-bluish": "#dce5f5",
        "--dsw-alias-label-primary-foreground": "#080b14",
        "--dsw-alias-label-secondary": "#a7b2c5",
        "--dsw-alias-label-tertiary": "#7f8da5",
        "--dsw-alias-label-quaternary": "#647188",
        "--dsw-alias-label-caption": "#8f9db3",
        "--dsw-alias-label-dimmed": "#657188",
        "--dsw-alias-label-primary-dimmed": "#b5bfd0",
        "--dsw-alias-label-inverse": "#080b14",
        "--dsw-alias-label-error": "#ff8795",

        "--dsw-alias-brand-primary": "#8c72f2",
        "--dsw-alias-brand-primary-new-colorprimary-new-color": "#8c72f2",
        "--dsw-alias-button-primary-fill": "#7d63de",
        "--dsw-alias-button-primary-hover": "#9078ed",
        "--dsw-alias-button-info-fill": "rgba(140, 114, 242, 0.18)",
        "--dsw-alias-button-info-hover": "rgba(140, 114, 242, 0.26)",
        "--dsw-alias-button-elevated-fill": "rgba(31, 44, 68, 0.92)",
        "--dsw-alias-button-floating-fill": "rgba(24, 35, 56, 0.96)",
        "--dsw-alias-button-floating-hover": "rgba(36, 49, 74, 0.98)",
        "--dsw-alias-button-ghost-active-fill": "rgba(140, 114, 242, 0.2)",

        "--dsw-alias-interactive-bg-primary": "rgba(140, 114, 242, 0.16)",
        "--dsw-alias-interactive-bg-hover": "rgba(231, 236, 245, 0.07)",
        "--dsw-alias-interactive-bg-active": "rgba(140, 114, 242, 0.2)",
        "--dsw-alias-interactive-bg-hover-solid": "#1b2940",
        "--dsw-alias-interactive-bg-hover-danger": "rgba(255, 91, 111, 0.14)",
        "--dsw-alias-fill-l2": "rgba(125, 145, 177, 0.16)",
        "--dsw-alias-fill-tsp-secondary": "rgba(231, 236, 245, 0.08)",

        "--dsw-alias-scrollbar-bg-l2": "rgba(111, 128, 157, 0.28)",
        "--dsw-alias-scrollbar-hover-l2": "rgba(151, 168, 194, 0.42)",
        "--dsw-alias-markdown-citation": "#a992ff",
        "--dsw-alias-markdown-code-block": "rgba(10, 16, 28, 0.94)",
        "--dsw-alias-markdown-code-block-banner": "rgba(19, 29, 47, 0.98)",

        "--dsw-alias-state-business-primary": "#9a82f5",
        "--dsw-alias-state-business-tertiary": "rgba(140, 114, 242, 0.2)",
        "--dsw-alias-state-success-primary": "#64cda2",
        "--dsw-alias-state-success-tertiary": "rgba(72, 177, 136, 0.16)",
        "--dsw-alias-state-warn-primary": "#e3a85d",
        "--dsw-alias-state-warn-secondary": "#efbb78",
        "--dsw-alias-state-warn-tertiary": "rgba(227, 168, 93, 0.16)",
        "--dsw-alias-state-warn-label": "#efbb78",
        "--dsw-alias-state-error-primary": "#ff7185",
        "--dsw-alias-state-error-secondary": "#ff8fa0",

        "--dsw-font-family": "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        "--dsw-font-mono": "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
        "--dsw-mask-blur": "blur(22px) saturate(118%)",
        "--dsw-shadow-lv1": "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 22px rgba(1, 4, 12, 0.24)",
        "--dsw-shadow-lv2": "0 2px 5px rgba(0, 0, 0, 0.34), 0 18px 46px rgba(1, 4, 12, 0.38)",
        "--dsw-shadow-lv3": "0 5px 12px rgba(0, 0, 0, 0.38), 0 32px 78px rgba(1, 4, 12, 0.5)",

        "--dsw-specific-sidebar-fill": "rgba(15, 23, 38, 0.94)",
        "--dsw-specific-sidebar-nav-item-active": "rgba(140, 114, 242, 0.16)",
        "--dsw-specific-sidebar-nav-item-active-accent": "#8c72f2",
        "--dsw-specific-sidebar-nav-item-hover": "rgba(231, 236, 245, 0.06)",
        "--dsw-specific-input-major": "linear-gradient(180deg, #172236 0%, #121b2c 100%)",
        "--dsw-specific-bubble": "rgba(72, 56, 119, 0.46)",
        "--dsw-specific-menu": "rgba(19, 29, 47, 0.98)",
        "--dsw-specific-selector": "rgba(28, 40, 62, 0.94)",
        "--dsw-specific-tip": "rgba(23, 34, 54, 0.96)"
      })
    });

    function WhaleAppearanceSettings({ controller }) {
      const h = React.createElement;
      const [settings, setSettings] = React.useState(() => controller.read());
      const chinese = (navigator.language || "").toLowerCase().startsWith("zh");
      const copy = chinese ? {
        title: "鲸系外观",
        badge: "Whale",
        description: "选择浅雾或深海，并调节整体层次；输入卡片始终保持不透明。",
        reset: "恢复默认",
        theme: "主题",
        themeHint: "在鲸雾蓝与鲸渊深色之间切换",
        mist: "鲸雾",
        abyss: "鲸渊",
        canvas: "背景层次",
        canvasHint: "控制主画布的雾感与边界清晰度",
        soft: "柔雾",
        clear: "清晰",
        sidebar: "侧栏层次",
        sidebarHint: "只改变侧栏与会话区的明度关系",
        balanced: "均衡",
        deep: "稍深",
        glass: "玻璃强度",
        glassHint: "影响浮层和菜单，不影响输入卡片",
        standard: "标准",
        restrained: "克制"
      } : {
        title: "Whale appearance",
        badge: "Whale",
        description: "Choose mist or abyss, then tune the depth. The composer stays opaque.",
        reset: "Reset",
        theme: "Theme",
        themeHint: "Switch between Whale Mist and Whale Abyss",
        mist: "Mist",
        abyss: "Abyss",
        canvas: "Canvas depth",
        canvasHint: "Controls mist and edge separation on the main canvas",
        soft: "Soft",
        clear: "Clear",
        sidebar: "Sidebar depth",
        sidebarHint: "Changes only the brightness relationship with conversation",
        balanced: "Balanced",
        deep: "Deeper",
        glass: "Glass strength",
        glassHint: "Affects overlays and menus, never the composer",
        standard: "Standard",
        restrained: "Restrained"
      };

      const update = (key, value) => {
        setSettings(controller.set(key, value));
      };
      const reset = () => {
        setSettings(controller.reset());
      };
      const row = (key, label, hint, values) => h("div", {
        className: "wm-settings-row",
        key
      }, [
        h("div", { className: "wm-settings-copy", key: "copy" }, [
          h("div", { className: "wm-settings-label", key: "label" }, label),
          h("div", { className: "wm-settings-hint", key: "hint" }, hint)
        ]),
        h("div", {
          className: "wm-settings-segment",
          role: "group",
          "aria-label": label,
          key: "segment"
        }, values.map((value) => h("button", {
          type: "button",
          className: `wm-settings-option${settings[key] === value ? " is-selected" : ""}`,
          "aria-pressed": settings[key] === value,
          "data-wm-setting": key,
          "data-wm-value": value,
          onClick: () => update(key, value),
          key: value
        }, copy[value])))
      ]);

      return h("section", {
        className: "wm-settings-group",
        "data-wm-settings": ""
      }, [
        h("div", { className: "wm-settings-head", key: "head" }, [
          h("div", { className: "wm-settings-heading", key: "heading" }, [
            h("span", { className: "wm-settings-title", key: "title" }, copy.title),
            h("span", { className: "wm-settings-badge", key: "badge" }, copy.badge)
          ]),
          h("button", {
            type: "button",
            className: "wm-settings-reset",
            onClick: reset,
            key: "reset"
          }, copy.reset)
        ]),
        h("p", { className: "wm-settings-description", key: "description" }, copy.description),
        row("theme", copy.theme, copy.themeHint, ALLOWED_SETTINGS.theme),
        row("canvas", copy.canvas, copy.canvasHint, ALLOWED_SETTINGS.canvas),
        row("sidebar", copy.sidebar, copy.sidebarHint, ALLOWED_SETTINGS.sidebar),
        row("glass", copy.glass, copy.glassHint, ALLOWED_SETTINGS.glass)
      ]);
    }

    function WhaleSessionStatus({ useSession, statusController }) {
      const h = React.createElement;
      const running = useSession((snapshot) => snapshot.running);
      // DSH <= 0.1.1 exposed approval prompts as `pending`; the 0.1.5
      // SessionSnapshot removed that field. Keep the legacy signal when present,
      // but never let a missing optional capability crash the whole header slot.
      const pendingCount = useSession((snapshot) => (
        Array.isArray(snapshot.pending) ? snapshot.pending.length : 0
      ));
      const removed = useSession((snapshot) => snapshot.removed);
      const themeActive = React.useSyncExternalStore(
        statusController.theme.subscribe,
        statusController.theme.getSnapshot,
        statusController.theme.getSnapshot
      );
      const [qaStatus, setQaStatus] = React.useState(null);
      const actualStatus = removed
        ? "idle"
        : pendingCount > 0
          ? "waiting"
          : running
            ? "running"
            : "idle";
      const liveStatus = qaStatus ?? actualStatus;
      const previousStatus = React.useRef(liveStatus);
      const [displayStatus, setDisplayStatus] = React.useState(liveStatus);
      const [leaving, setLeaving] = React.useState(false);

      React.useEffect(() => {
        // Private test signal. Keeping this listener inert until the custom
        // event arrives avoids depending on Harness' short-lived token URL:
        // its query string is cleared before delayed Session headers mount.
        const receivePreview = (event) => {
          const next = event.detail;
          setQaStatus(["idle", "running", "waiting"].includes(next) ? next : null);
        };
        window.addEventListener("dsh-whale-mist:qa-status", receivePreview);
        return () => window.removeEventListener("dsh-whale-mist:qa-status", receivePreview);
      }, []);

      React.useEffect(() => {
        const previous = previousStatus.current;
        previousStatus.current = liveStatus;
        let leaveTimer;
        let clearTimer;

        if (liveStatus !== "idle") {
          setLeaving(false);
          setDisplayStatus(liveStatus);
        } else if (previous === "running" || previous === "waiting") {
          setLeaving(false);
          setDisplayStatus("complete");
          leaveTimer = window.setTimeout(() => setLeaving(true), 1100);
          clearTimer = window.setTimeout(() => {
            setDisplayStatus("idle");
            setLeaving(false);
          }, 1340);
        } else {
          setDisplayStatus("idle");
          setLeaving(false);
        }

        return () => {
          window.clearTimeout(leaveTimer);
          window.clearTimeout(clearTimer);
        };
      }, [liveStatus]);

      if (!themeActive || displayStatus === "idle") return null;

      const chinese = (navigator.language || "").toLowerCase().startsWith("zh");
      const labels = chinese ? {
        running: "运行中",
        waiting: "等待确认",
        complete: "已完成"
      } : {
        running: "Running",
        waiting: "Waiting for you",
        complete: "Complete"
      };
      const label = labels[displayStatus];

      return h("div", {
        className: `wm-session-status wm-session-status-${displayStatus}${leaving ? " is-leaving" : ""}`,
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        "aria-label": label,
        title: label,
        "data-wm-status": displayStatus
      }, [
        h("span", { className: "wm-status-mark", "aria-hidden": "true", key: "mark" },
          h(FishLogo, { size: 13, className: "wm-status-logo" })
        ),
        h("span", { className: "wm-status-label", key: "label" }, label)
      ]);
    }

    const css = `
      body.${ACTIVE_CLASS} {
        min-height: 100vh;
        background:
          radial-gradient(72rem 46rem at 78% -12%, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.18) 45%, transparent 68%),
          radial-gradient(42rem 32rem at -8% 72%, rgba(181, 222, 250, 0.38) 0%, transparent 70%),
          linear-gradient(145deg, #f4f9ff 0%, #edf6fe 48%, #e6f2fc 100%);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        font-optical-sizing: auto;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      body.${ACTIVE_CLASS}::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(108deg, rgba(255, 255, 255, 0.22), transparent 34%, rgba(119, 187, 230, 0.06));
      }

      body.${ACTIVE_CLASS}[data-wm-canvas="clear"] {
        --dsw-alias-bg-base: rgba(244, 250, 255, 0.9) !important;
        --dsw-alias-bg-layer-1: rgba(255, 255, 255, 0.78) !important;
        --dsw-alias-bg-layer-2: rgba(229, 241, 250, 0.82) !important;
        background:
          radial-gradient(68rem 40rem at 80% -10%, #ffffff 0%, rgba(255, 255, 255, 0.2) 48%, transparent 70%),
          linear-gradient(145deg, #f7fbff 0%, #eef7fe 52%, #e7f3fc 100%);
      }

      body.${ACTIVE_CLASS}[data-wm-sidebar="deep"] {
        --dsw-specific-sidebar-fill: rgba(207, 229, 246, 0.9) !important;
        --dsw-specific-sidebar-nav-item-active: rgba(255, 255, 255, 0.7) !important;
        --dsw-specific-sidebar-nav-item-hover: rgba(255, 255, 255, 0.5) !important;
      }

      body.${ACTIVE_CLASS}[data-wm-glass="restrained"] {
        --dsw-alias-bg-layer-1: rgba(251, 254, 255, 0.9) !important;
        --dsw-alias-bg-layer-2: rgba(231, 242, 250, 0.92) !important;
        --dsw-alias-bg-layer-3: rgba(252, 254, 255, 0.94) !important;
        --dsw-alias-bg-overlay: #f8fbfe !important;
        --dsw-specific-menu: #f8fbfe !important;
        --dsw-specific-selector: rgba(248, 252, 255, 0.9) !important;
        --dsw-mask-blur: blur(12px) saturate(112%) !important;
      }

      body.${ABYSS_ACTIVE_CLASS} {
        min-height: 100vh;
        background:
          radial-gradient(60rem 38rem at 82% -14%, rgba(116, 91, 204, 0.13) 0%, transparent 66%),
          radial-gradient(46rem 34rem at -12% 78%, rgba(64, 111, 151, 0.12) 0%, transparent 72%),
          linear-gradient(145deg, #0b111d 0%, #080b14 52%, #070a12 100%);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        font-optical-sizing: auto;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      body.${ABYSS_ACTIVE_CLASS}::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(108deg, rgba(117, 146, 187, 0.025), transparent 38%, rgba(140, 114, 242, 0.035));
      }

      body.${ABYSS_ACTIVE_CLASS}[data-wm-canvas="clear"] {
        --dsw-alias-bg-base: #080b14 !important;
        --dsw-alias-bg-layer-1: #0f1726 !important;
        --dsw-alias-bg-layer-2: #172236 !important;
        background:
          radial-gradient(58rem 36rem at 84% -16%, rgba(116, 91, 204, 0.09) 0%, transparent 68%),
          linear-gradient(145deg, #0c1321 0%, #080b14 58%, #070a12 100%);
      }

      body.${ABYSS_ACTIVE_CLASS}[data-wm-sidebar="deep"] {
        --dsw-specific-sidebar-fill: rgba(10, 16, 28, 0.98) !important;
        --dsw-specific-sidebar-nav-item-active: rgba(140, 114, 242, 0.18) !important;
        --dsw-specific-sidebar-nav-item-hover: rgba(231, 236, 245, 0.055) !important;
      }

      body.${ABYSS_ACTIVE_CLASS}[data-wm-glass="restrained"] {
        --dsw-alias-bg-layer-1: rgba(15, 23, 38, 0.985) !important;
        --dsw-alias-bg-layer-2: rgba(23, 34, 54, 0.985) !important;
        --dsw-alias-bg-layer-3: rgba(28, 40, 62, 0.99) !important;
        --dsw-alias-bg-overlay: #172236 !important;
        --dsw-specific-menu: #131d2f !important;
        --dsw-specific-selector: #1c283e !important;
        --dsw-mask-blur: blur(12px) saturate(106%) !important;
      }

      .wm-settings-group {
        box-sizing: border-box;
        width: 100%;
        border-bottom: 1px solid var(--dsw-alias-border-l2);
        padding: 16px 0;
      }

      .wm-settings-head,
      .wm-settings-heading,
      .wm-settings-row,
      .wm-settings-segment {
        display: flex;
        align-items: center;
      }

      .wm-settings-head {
        justify-content: space-between;
        gap: 16px;
      }

      .wm-settings-heading {
        min-width: 0;
        gap: 8px;
      }

      .wm-settings-title {
        color: var(--dsw-alias-label-primary);
        font-size: 14px;
        font-weight: 500;
        line-height: 22px;
      }

      .wm-settings-badge {
        color: var(--dsw-alias-brand-primary);
        background: var(--dsw-alias-state-business-tertiary);
        border-radius: 999px;
        padding: 1px 7px;
        font-size: 11px;
        font-weight: 600;
        line-height: 18px;
        letter-spacing: 0.01em;
      }

      .wm-settings-description {
        max-width: 38rem;
        margin: 4px 0 10px;
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
        line-height: 20px;
      }

      .wm-settings-reset {
        flex: none;
        min-height: 30px;
        border: 0;
        border-radius: 9px;
        padding: 4px 9px;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        font: inherit;
        font-size: 12px;
        line-height: 20px;
        cursor: pointer;
      }

      .wm-settings-reset:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-interactive-bg-hover);
      }

      .wm-settings-row {
        justify-content: space-between;
        gap: 20px;
        min-height: 52px;
        border-top: 1px solid var(--dsw-alias-separator-primary);
      }

      .wm-settings-copy {
        min-width: 0;
        padding: 8px 0;
      }

      .wm-settings-label {
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
      }

      .wm-settings-hint {
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        line-height: 18px;
      }

      .wm-settings-segment {
        flex: none;
        gap: 2px;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 11px;
        padding: 2px;
        background: var(--dsw-alias-bg-layer-2);
      }

      .wm-settings-option {
        min-width: 64px;
        min-height: 30px;
        border: 0;
        border-radius: 8px;
        padding: 4px 10px;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        cursor: pointer;
      }

      .wm-settings-option:hover:not(.is-selected) {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-interactive-bg-hover);
      }

      .wm-settings-option.is-selected {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: var(--dsw-shadow-lv1);
      }

      .wm-session-status {
        display: inline-flex;
        align-items: center;
        box-sizing: border-box;
        height: 26px;
        gap: 6px;
        border: 1px solid rgba(54, 101, 136, 0.15);
        border-radius: 999px;
        padding: 0 9px 0 5px;
        color: var(--dsw-alias-label-secondary);
        background: rgba(250, 253, 255, 0.72);
        box-shadow: 0 1px 2px rgba(36, 76, 106, 0.05);
        font-family: var(--dsw-font-family);
        font-size: 12px;
        font-weight: 500;
        line-height: 16px;
        white-space: nowrap;
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease, border-color 160ms ease, color 160ms ease;
        animation: wm-status-arrive 160ms cubic-bezier(0.23, 1, 0.32, 1) both;
      }

      .wm-session-status.is-leaving {
        opacity: 0;
        transform: translateY(-2px) scale(0.98);
      }

      .wm-status-mark {
        position: relative;
        display: grid;
        flex: none;
        width: 18px;
        height: 18px;
        place-items: center;
        border-radius: 50%;
        color: #ffffff;
        background: var(--dsw-alias-brand-primary);
        transition: background-color 160ms ease;
      }

      .wm-status-logo {
        display: block;
      }

      .wm-session-status-running .wm-status-mark::after {
        content: "";
        position: absolute;
        inset: -3px;
        border: 1px solid rgba(20, 104, 168, 0.34);
        border-radius: inherit;
        animation: wm-status-breathe 1.8s ease-out infinite;
      }

      .wm-session-status-waiting {
        color: var(--dsw-alias-state-warn-label);
        border-color: rgba(169, 106, 34, 0.19);
        background: rgba(255, 250, 240, 0.82);
      }

      .wm-session-status-waiting .wm-status-mark {
        background: var(--dsw-alias-state-warn-primary);
      }

      .wm-session-status-complete {
        color: var(--dsw-alias-state-success-primary);
        border-color: rgba(43, 129, 100, 0.18);
        background: rgba(244, 252, 248, 0.84);
      }

      .wm-session-status-complete .wm-status-mark {
        background: var(--dsw-alias-state-success-primary);
      }

      body.${ABYSS_ACTIVE_CLASS} .wm-session-status {
        border-color: rgba(125, 145, 177, 0.17);
        background: rgba(19, 29, 47, 0.9);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
      }

      body.${ABYSS_ACTIVE_CLASS} .wm-session-status-running .wm-status-mark::after {
        border-color: rgba(140, 114, 242, 0.46);
      }

      body.${ABYSS_ACTIVE_CLASS} .wm-session-status-waiting {
        border-color: rgba(227, 168, 93, 0.22);
        background: rgba(53, 40, 27, 0.88);
      }

      body.${ABYSS_ACTIVE_CLASS} .wm-session-status-complete {
        border-color: rgba(100, 205, 162, 0.2);
        background: rgba(19, 47, 40, 0.88);
      }

      @keyframes wm-status-arrive {
        from {
          opacity: 0;
          transform: translateY(2px) scale(0.98);
        }
      }

      @keyframes wm-status-breathe {
        0% {
          opacity: 0;
          transform: scale(0.82);
        }
        42% {
          opacity: 0.62;
        }
        100% {
          opacity: 0;
          transform: scale(1.18);
        }
      }

      @media (max-width: 720px) {
        .wm-settings-row {
          align-items: stretch;
          flex-direction: column;
          gap: 4px;
          padding: 10px 0;
        }

        .wm-settings-segment {
          align-self: stretch;
        }

        .wm-settings-option {
          flex: 1;
        }
      }

      /* Harmonize dsh-reasoning-effort with Whale Mist's light surface.
         Keep the resting track blue-white and let the plugin's moving radiation
         carry the indigo-violet depth without affecting the
         official light/dark themes. */
      body.${ACTIVE_CLASS} .re-effort-track {
        background:
          linear-gradient(100deg, #f8fcff 0%, #edf7ff 48%, #dceefb 100%) !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.92),
          inset 0 0 0 1px rgba(72, 124, 164, 0.14),
          0 3px 12px rgba(47, 91, 124, 0.12) !important;
      }

      body.${ACTIVE_CLASS} .re-effort-slider:not([data-effort="off"]) .re-effort-track::before {
        background: linear-gradient(90deg, #e9dcff 0%, #c9a9ff 22%, #8e62dd 56%, #4d278f 100%) !important;
      }

      body.${ACTIVE_CLASS} .re-effort-slider[data-top="true"] .re-effort-track::before,
      body.${ACTIVE_CLASS} .re-effort-slider[data-effort="max"] .re-effort-track::before {
        background: linear-gradient(90deg, #e9dcff 0%, #bc91ff 18%, #7950cf 54%, #3f1b7f 100%) !important;
      }

      body.${ACTIVE_CLASS} .re-effort-slider:not([data-effort="off"]) .re-effort-track::after {
        background:
          radial-gradient(circle at 18% 45%, rgba(137, 96, 230, 0.2), transparent 25%),
          linear-gradient(90deg, rgba(106, 63, 179, 0.08), transparent 42%, rgba(70, 31, 139, 0.18)) !important;
      }

      body.${ACTIVE_CLASS} .re-effort .re-effort-canvas {
        opacity: 0.9;
        mix-blend-mode: multiply;
        filter: hue-rotate(42deg) saturate(1.5) contrast(1.08);
      }

      body.${ACTIVE_CLASS} .re-effort.is-dragging .re-effort-canvas {
        filter: hue-rotate(42deg) saturate(1.66) brightness(1.1) contrast(1.12);
      }

      body.${ACTIVE_CLASS} .re-effort-fx::after {
        content: "";
        position: absolute;
        z-index: 3;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background:
          radial-gradient(ellipse 68px 34px at var(--re-progress) 50%, rgba(198, 156, 255, 0.5) 0%, rgba(137, 96, 234, 0.24) 34%, transparent 72%);
        mix-blend-mode: multiply;
        opacity: 1;
        transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
      }

      /* v0.8 renders the lowest position as range value 0 instead of
         exposing the older data-effort attribute. */
      body.${ACTIVE_CLASS} .re-effort-slider[data-effort="off"] .re-effort-fx::after,
      body.${ACTIVE_CLASS} .re-effort-slider:has(.re-effort-input[value="0"]) .re-effort-fx::after {
        opacity: 0;
      }

      body.${ACTIVE_CLASS} .re-effort .re-effort-flare {
        background: radial-gradient(ellipse at 100% 50%, rgba(241, 228, 255, 0.94) 0 4%, rgba(209, 181, 255, 0.84) 12%, rgba(139, 83, 235, 0.58) 30%, rgba(75, 35, 156, 0.22) 53%, transparent 75%);
        filter: blur(2px) saturate(1.24);
        transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1);
      }

      body.${ACTIVE_CLASS} .re-effort .re-effort-flare::before {
        background: linear-gradient(90deg, transparent, rgba(151, 112, 245, 0.46), #eadcff, rgba(116, 53, 202, 0.7), transparent) !important;
        box-shadow: 0 0 7px rgba(155, 103, 235, 0.72), 0 0 13px rgba(91, 70, 201, 0.5) !important;
      }

      body.${ACTIVE_CLASS} .re-effort .re-effort-flare::after {
        background: linear-gradient(180deg, transparent, rgba(222, 194, 255, 0.92), transparent) !important;
        box-shadow: 0 0 7px rgba(140, 83, 223, 0.68) !important;
      }

      body.${ACTIVE_CLASS} .re-effort-slider[data-effort="off"] .re-effort-flare,
      body.${ACTIVE_CLASS} .re-effort-slider:has(.re-effort-input[value="0"]) .re-effort-flare {
        opacity: 0;
      }

      body.${ACTIVE_CLASS} .re-effort.is-dragging .re-effort-flare {
        filter: blur(1.5px) saturate(1.38) brightness(1.22);
      }

      body.${ACTIVE_CLASS} .re-effort .re-effort-knob {
        box-shadow:
          0 0 0 2px rgba(94, 133, 222, 0.16),
          0 0 13px rgba(119, 82, 205, 0.38),
          0 2px 7px rgba(34, 61, 88, 0.24);
      }

      body.${ACTIVE_CLASS} .re-effort-slider[data-effort="off"] .re-effort-knob,
      body.${ACTIVE_CLASS} .re-effort-slider:has(.re-effort-input[value="0"]) .re-effort-knob {
        box-shadow:
          0 0 0 2px rgba(74, 139, 190, 0.12),
          0 3px 9px rgba(42, 86, 119, 0.18);
      }

      body.${ACTIVE_CLASS} .re-effort-slider[data-top="true"] .re-effort-knob,
      body.${ACTIVE_CLASS} .re-effort-slider[data-effort="max"] .re-effort-knob {
        box-shadow:
          0 0 0 3px rgba(126, 99, 221, 0.18),
          0 0 20px rgba(132, 83, 225, 0.62),
          0 0 30px rgba(64, 126, 218, 0.28),
          0 3px 8px rgba(34, 61, 88, 0.24);
      }

      body.${ACTIVE_CLASS} button,
      body.${ACTIVE_CLASS} [role="button"],
      body.${ABYSS_ACTIVE_CLASS} button,
      body.${ABYSS_ACTIVE_CLASS} [role="button"] {
        transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
      }

      body.${ACTIVE_CLASS} button:active,
      body.${ACTIVE_CLASS} [role="button"]:active,
      body.${ABYSS_ACTIVE_CLASS} button:active,
      body.${ABYSS_ACTIVE_CLASS} [role="button"]:active {
        transform: scale(0.975);
      }

      body.${ACTIVE_CLASS} :focus-visible {
        outline: 2px solid rgba(20, 104, 168, 0.62);
        outline-offset: 2px;
      }

      body.${ABYSS_ACTIVE_CLASS} :focus-visible {
        outline: 2px solid rgba(140, 114, 242, 0.72);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        body.${ACTIVE_CLASS} button,
        body.${ACTIVE_CLASS} [role="button"],
        body.${ABYSS_ACTIVE_CLASS} button,
        body.${ABYSS_ACTIVE_CLASS} [role="button"] {
          transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        body.${ACTIVE_CLASS} button:active,
        body.${ACTIVE_CLASS} [role="button"]:active,
        body.${ABYSS_ACTIVE_CLASS} button:active,
        body.${ABYSS_ACTIVE_CLASS} [role="button"]:active {
          transform: none;
        }

        .wm-session-status,
        .wm-session-status-running .wm-status-mark::after {
          animation: none;
        }

        .wm-session-status {
          transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
        }
      }

      @media (prefers-reduced-transparency: reduce) {
        body.${ACTIVE_CLASS} {
          --dsw-alias-bg-base: #eef7fe !important;
          --dsw-alias-bg-layer-1: #f8fbfe !important;
          --dsw-alias-bg-layer-2: #e5f1fa !important;
          --dsw-alias-bg-overlay: #f8fbfe !important;
          --dsw-specific-sidebar-fill: #deedf8 !important;
          --dsw-specific-input-major: #f8fbfe !important;
          --dsw-specific-menu: #f8fbfe !important;
          --dsw-mask-blur: none !important;
        }

        body.${ABYSS_ACTIVE_CLASS} {
          --dsw-alias-bg-base: #080b14 !important;
          --dsw-alias-bg-layer-1: #0f1726 !important;
          --dsw-alias-bg-layer-2: #172236 !important;
          --dsw-alias-bg-overlay: #172236 !important;
          --dsw-specific-sidebar-fill: #0f1726 !important;
          --dsw-specific-input-major: #172236 !important;
          --dsw-specific-menu: #131d2f !important;
          --dsw-mask-blur: none !important;
        }
      }

      @media (prefers-contrast: more) {
        body.${ACTIVE_CLASS} {
          --dsw-alias-label-secondary: #3c566b !important;
          --dsw-alias-label-tertiary: #506b80 !important;
          --dsw-alias-border-l2: rgba(23, 63, 92, 0.38) !important;
          --dsw-alias-border-l3: rgba(16, 55, 83, 0.56) !important;
          --dsw-alias-bg-layer-1: rgba(255, 255, 255, 0.9) !important;
        }

        body.${ABYSS_ACTIVE_CLASS} {
          --dsw-alias-label-secondary: #c0cada !important;
          --dsw-alias-label-tertiary: #a3afc2 !important;
          --dsw-alias-border-l2: rgba(188, 201, 222, 0.38) !important;
          --dsw-alias-border-l3: rgba(204, 214, 231, 0.52) !important;
          --dsw-alias-bg-layer-1: rgba(15, 23, 38, 0.99) !important;
        }
      }
    `;

    const inject = ["theme", "slots"];

    function apply(ctx) {
      let settings = readSettings();
      const query = new URLSearchParams(window.location.search);
      const qaEnabled = query.has("wm-status-qa");
      const qaTheme = query.get("wm-theme-qa");
      if (qaEnabled && ALLOWED_SETTINGS.theme.includes(qaTheme)) {
        settings = normalizeSettings({ ...settings, theme: qaTheme });
      }
      const themeSignal = createBooleanSignal(false);
      const controller = {
        read: () => ({ ...settings }),
        set: (key, value) => {
          if (!ALLOWED_SETTINGS[key]?.includes(value)) return { ...settings };
          settings = normalizeSettings({ ...settings, [key]: value });
          persistSettings(settings);
          projectSettings(settings);
          if (key === "theme") ctx.theme.setTheme(selectedThemeId(settings));
          return { ...settings };
        },
        reset: () => {
          settings = { ...DEFAULT_SETTINGS };
          persistSettings(settings);
          projectSettings(settings);
          ctx.theme.setTheme(selectedThemeId(settings));
          return { ...settings };
        }
      };
      const syncActiveMarker = (snapshot) => {
        const mistActive = snapshot.active.id === THEME_ID;
        const abyssActive = snapshot.active.id === ABYSS_THEME_ID;
        document.body.classList.toggle(ACTIVE_CLASS, mistActive);
        document.body.classList.toggle(ABYSS_ACTIVE_CLASS, abyssActive);
        themeSignal.set(MANAGED_THEME_IDS.has(snapshot.active.id));
      };

      ctx.effect(() => {
        const disposeMist = ctx.theme.register(theme);
        const disposeAbyss = ctx.theme.register(abyssTheme);
        ctx.theme.setTheme(selectedThemeId(settings));
        return () => {
          disposeAbyss();
          disposeMist();
        };
      }, "whale: theme registration");

      ctx.effect(() => {
        // Current Harness releases may re-apply their persisted preference when
        // model settings change. Retain the selected Whale theme for the whole
        // plugin lifetime instead of only during the first paint.
        let queued = false;
        const off = ctx.on("theme/change", (snapshot) => {
          const desiredThemeId = selectedThemeId(settings);
          if (snapshot.active.id === desiredThemeId || queued) return;
          queued = true;
          queueMicrotask(() => {
            queued = false;
            let current = ctx.theme.getTheme();
            const currentDesiredThemeId = selectedThemeId(settings);
            if (current.active.id !== currentDesiredThemeId) {
              ctx.theme.setTheme(currentDesiredThemeId);
              current = ctx.theme.getTheme();
            }
            syncActiveMarker(current);
          });
        });
        const receiveThemeReset = (event) => {
          if (qaEnabled) ctx.theme.setTheme(event.detail || "dark");
        };
        window.addEventListener("dsh-whale-mist:qa-theme-reset", receiveThemeReset);
        return () => {
          window.removeEventListener("dsh-whale-mist:qa-theme-reset", receiveThemeReset);
          off();
        };
      }, "whale: active theme retention");

      ctx.effect(() => {
        const previous = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
        previous?.remove();
        const tag = document.createElement("style");
        tag.dataset.plugin = "dsh-whale-mist";
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = css;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, "whale-mist: glass material stylesheet");

      ctx.effect(() => {
        syncActiveMarker(ctx.theme.getTheme());
        const off = ctx.on("theme/change", syncActiveMarker);
        return () => {
          off();
          document.body.classList.remove(ACTIVE_CLASS);
          document.body.classList.remove(ABYSS_ACTIVE_CLASS);
          themeSignal.set(false);
        };
      }, "whale: active theme marker");

      ctx.effect(() => {
        projectSettings(settings);
        return () => {
          delete document.body.dataset.wmTheme;
          delete document.body.dataset.wmCanvas;
          delete document.body.dataset.wmSidebar;
          delete document.body.dataset.wmGlass;
        };
      }, "whale-mist: appearance projection");

      ctx.slots.inject("settings.general.item", () => ctx.slots.register({
        name: "settings.general.item",
        id: "whale-mist",
        order: 45,
        inject: () => ({ controller })
      }, WhaleAppearanceSettings));

      ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
        name: "conversation.session.header.actions",
        id: "whale-session-status",
        order: -5,
        inject: () => ({ statusController: { theme: themeSignal, qaEnabled } })
      }, WhaleSessionStatus));
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
