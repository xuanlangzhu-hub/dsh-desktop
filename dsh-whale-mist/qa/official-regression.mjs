import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const appUrl = process.env.DSH_TEST_URL ?? "http://127.0.0.1:3080/";
const expectedThemes = Object.freeze({
  "whale-mist": Object.freeze({ setting: "mist", activeClass: "dsh-whale-mist-active", colorScheme: "light", brand: "#1468a8", deepSidebarFragment: "207" }),
  "whale-abyss": Object.freeze({ setting: "abyss", activeClass: "dsh-whale-abyss-active", colorScheme: "dark", brand: "#8c72f2", deepSidebarFragment: "11, 17, 29" }),
});
const expectedThemeId = process.env.DSH_EXPECT_THEME ?? "whale-mist";
const expectedTheme = expectedThemes[expectedThemeId];
if (!expectedTheme) throw new Error(`Unknown DSH_EXPECT_THEME: ${expectedThemeId}`);
const alternateThemeId = expectedThemeId === "whale-abyss" ? "whale-mist" : "whale-abyss";
const alternateTheme = expectedThemes[alternateThemeId];
const launchUrl = new URL(appUrl);
launchUrl.searchParams.set("wm-status-qa", "1");
launchUrl.searchParams.set("wm-theme-qa", expectedTheme.setting);
const debugPort = 9400 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), "dsh-whale-mist-official-"));
const output = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist.png");
const trajectoryOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-trajectory.png");
const settingsOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-settings.png");
const statusOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-status.png");
const reasoningOutput = join(tmpdir(), "dsh-whale-mist-reasoning.png");
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-sync",
  "--no-proxy-server",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-default-apps",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,960",
  launchUrl.href,
], { stdio: "ignore" });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findPage() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === "page" && target.url.startsWith(appUrl));
      if (page) return page;
      if (attempt === 12) {
        await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" });
      }
    } catch {}
    await delay(100);
  }
  browser.kill();
  throw new Error("Timed out waiting for the official Harness page.");
}

const target = await findPage();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function cdp(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function clickAt({ x, y }) {
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

const uiState = `(() => {
  const body = document.body;
  const expectedActiveClass = ${JSON.stringify(expectedTheme.activeClass)};
  if (!body) return { ready: false, stage: 'document-loading' };
  const candidates = [...document.querySelectorAll('button[aria-label]')];
  const toggle = candidates.find(button => /侧边栏|sidebar/i.test(button.getAttribute('aria-label') || ''));
  const bodyStyle = getComputedStyle(body);
  if (!toggle) {
    return {
      ready: false,
      active: body.classList.contains(expectedActiveClass),
      labels: candidates.map(button => button.getAttribute('aria-label')).filter(Boolean).slice(0, 30),
    };
  }
  const rect = toggle.getBoundingClientRect();
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const hit = rect.width > 0 && rect.height > 0 ? document.elementFromPoint(center.x, center.y) : null;
  return {
    ready: true,
    active: body.classList.contains(expectedActiveClass),
    darkMode: body.hasAttribute('data-ds-dark-theme'),
    theme: body.dataset.wmTheme,
    styleTag: Boolean(document.querySelector('style[data-plugin-css="dsh-whale-mist/theme.css"]')),
    ariaLabel: toggle.getAttribute('aria-label'),
    width: rect.width,
    height: rect.height,
    x: center.x,
    y: center.y,
    hit: Boolean(hit && (hit === toggle || toggle.contains(hit))),
    hitTarget: hit ? {
      tag: hit.tagName,
      className: typeof hit.className === 'string' ? hit.className : null,
      ariaLabel: hit.getAttribute?.('aria-label') || null,
      pointerEvents: getComputedStyle(hit).pointerEvents,
      position: getComputedStyle(hit).position,
      zIndex: getComputedStyle(hit).zIndex,
      opacity: getComputedStyle(hit).opacity,
      outerHTML: hit.outerHTML.slice(0, 500),
      parentHTML: hit.parentElement?.outerHTML.slice(0, 1600) || null,
    } : null,
    dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
      .map((element) => ({
        text: (element.textContent || '').trim().slice(0, 500),
        html: element.outerHTML.slice(0, 800),
      })),
    sidebarFill: bodyStyle.getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    inputFill: bodyStyle.getPropertyValue('--dsw-specific-input-major').trim(),
    inputFillOpaque: /^(linear-gradient|#|rgb\([^,]+,[^,]+,[^)]+\)$)/.test(bodyStyle.getPropertyValue('--dsw-specific-input-major').trim()),
    brand: bodyStyle.getPropertyValue('--dsw-alias-brand-primary').trim(),
  };
})()`;

main: {
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  let initial;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    initial = await evaluate(uiState);
    if (initial?.ready && initial.active && initial.styleTag) break;
    await delay(100);
  }

  // Cross the boot stabilization window so the assertion catches a late
  // persisted system-theme adoption instead of sampling only the first paint.
  await delay(2100);
  initial = await evaluate(uiState);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const onboardingTarget = await evaluate(`(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const dialog = dialogs.find((element) =>
        /内测声明|beta notice|添加一个 api key|add an api key/i.test(
          element.getAttribute('aria-label') || element.textContent || '',
        ));
      const button = dialog && [...dialog.querySelectorAll('button')]
        .find((element) => /^(继续|continue|稍后配置|not now|configure later)$/i.test((element.textContent || '').trim()));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!onboardingTarget) break;
    await clickAt(onboardingTarget);
    await delay(240);
    initial = await evaluate(uiState);
  }

  if (!initial?.ready || !initial.active || !initial.styleTag || !initial.inputFillOpaque
    || initial.darkMode !== (expectedTheme.colorScheme === "dark")
    || initial.theme !== expectedTheme.setting
    || initial.brand.toLowerCase() !== expectedTheme.brand) {
    throw new Error(`${expectedThemeId} did not become active: ${JSON.stringify(initial)}`);
  }
  if (!initial.hit || initial.width < 28 || initial.height < 28) {
    throw new Error(`Initial official sidebar toggle is not usable: ${JSON.stringify(initial)}`);
  }
  // Harness may re-apply its persisted system theme while synchronizing model
  // settings. Simulate that late reset and require the selected Whale theme to recover.
  const resetThemeId = expectedTheme.colorScheme === "dark" ? "light" : "dark";
  await evaluate(`window.dispatchEvent(new CustomEvent('dsh-whale-mist:qa-theme-reset', { detail: ${JSON.stringify(resetThemeId)} }))`);
  await delay(180);
  const recoveredTheme = await evaluate(uiState);
  if (!recoveredTheme?.active || !recoveredTheme.styleTag || !recoveredTheme.inputFillOpaque) {
    throw new Error(`${expectedThemeId} did not recover after a late theme reset: ${JSON.stringify(recoveredTheme)}`);
  }
  if (process.env.DSH_THEME_RETENTION_ONLY === "1") {
    const shellOutput = join(tmpdir(), `dsh-whale-${expectedTheme.setting}-shell.png`);
    let shellScreenshot = null;
    if (process.env.DSH_CAPTURE_THEME_SHELL === "1") {
      const shellCapture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      await writeFile(shellOutput, Buffer.from(shellCapture.data, "base64"));
      shellScreenshot = shellOutput;
    }
    let anchoredStandardVisible = null;
    if (process.env.DSH_EXPECT_ANCHORED_STANDARD === "1") {
      const presetTarget = await evaluate(`(() => {
        const element = [...document.querySelectorAll('button')]
          .find((button) => /(标准模式|Standard mode|Anchored Standard)/i.test((button.textContent || '').trim()));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!presetTarget) throw new Error("Agent preset selector is missing during preset visibility QA.");
      await clickAt(presetTarget);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        anchoredStandardVisible = await evaluate(`/Anchored Standard/i.test(document.body?.innerText || '')`);
        if (anchoredStandardVisible) break;
        await delay(100);
      }
      if (!anchoredStandardVisible) throw new Error("Anchored Standard did not register in the Agent preset selector.");
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
      await delay(120);
    }
    let visionModelSelected = null;
    if (process.env.DSH_EXPECT_VISION_MODEL === "1") {
      const modelTarget = await evaluate(`(() => {
        const element = [...document.querySelectorAll('button')]
          .find((button) => /DeepSeek-V4-(?:Flash|Pro)/i.test((button.textContent || '').trim()));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!modelTarget) throw new Error("Model selector is missing during Vision model QA.");
      await clickAt(modelTarget);
      await delay(120);
      const catalogTarget = await evaluate(`(() => {
        const element = [...document.querySelectorAll('button[role="menuitem"], [role="menuitem"]')]
          .find((candidate) => /(?:模型|Model).*DeepSeek-V4/i.test((candidate.textContent || '').trim()));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!catalogTarget) throw new Error("Model catalog submenu is missing during Vision model QA.");
      await clickAt(catalogTarget);
      let visionTarget = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        visionTarget = await evaluate(`(() => {
          const element = [...document.querySelectorAll('button, [role="option"], [role="menuitem"]')]
            .find((candidate) => /DeepSeek-V4-Flash-Vision-Exp/i.test((candidate.textContent || '').trim()));
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0
            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            : null;
        })()`);
        if (visionTarget) break;
        await delay(100);
      }
      if (!visionTarget) throw new Error("DeepSeek-V4-Flash-Vision-Exp did not register in the model selector.");
      await clickAt(visionTarget);
      await delay(500);
      const afterVisionSwitch = await evaluate(`({
        selected: [...document.querySelectorAll('button')]
          .some((button) => /DeepSeek-V4-Flash-Vision-Exp/i.test((button.textContent || '').trim())),
        active: document.body?.classList.contains(${JSON.stringify(expectedTheme.activeClass)}) ?? false,
        styleTag: Boolean(document.querySelector('style[data-plugin-css="dsh-whale-mist/theme.css"]')),
      })`);
      if (!afterVisionSwitch.selected || !afterVisionSwitch.active || !afterVisionSwitch.styleTag) {
        throw new Error(`Vision model switch lost selection or Whale Mist: ${JSON.stringify(afterVisionSwitch)}`);
      }
      visionModelSelected = true;
    }
    let reasoningEffortSelected = null;
    if (process.env.DSH_EXPECT_REASONING_EFFORT === "1") {
      const reasoningTrigger = await evaluate(`(() => {
        const button = document.querySelector('button.re-model-trigger');
        if (!(button instanceof HTMLButtonElement)) return null;
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : null;
      })()`);
      if (!reasoningTrigger) throw new Error("Reasoning effort model trigger is missing during theme retention QA.");
      await clickAt(reasoningTrigger);
      await delay(180);

      let effortTarget = null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        effortTarget = await evaluate(`(() => {
          const input = document.querySelector('input[type="range"][aria-label="推理强度"]');
          if (!(input instanceof HTMLInputElement)) return null;
          const rect = input.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || input.disabled) return null;
          const current = input.getAttribute('aria-valuetext') || '';
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            current,
            key: current === 'max' ? 'Home' : 'End',
            expected: current === 'max' ? 'off' : 'max',
          };
        })()`);
        if (effortTarget) break;
        await delay(100);
      }
      if (!effortTarget) {
        const diagnostics = await evaluate(`({
          path: window.location.pathname,
          ranges: [...document.querySelectorAll('input[type="range"]')].map((input) => ({
            label: input.getAttribute('aria-label'),
            valueText: input.getAttribute('aria-valuetext'),
            disabled: input.disabled,
          })),
          buttons: [...document.querySelectorAll('button')].map((button) => (button.textContent || '').trim()).filter(Boolean).slice(0, 40),
          bodyText: (document.body?.innerText || '').slice(0, 2000),
        })`);
        throw new Error(`Reasoning effort slider is missing during theme retention QA: ${JSON.stringify(diagnostics)}`);
      }
      await clickAt(effortTarget);
      await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: effortTarget.key, code: effortTarget.key });
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: effortTarget.key, code: effortTarget.key });
      let afterEffortSwitch = null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        afterEffortSwitch = await evaluate(`(() => {
          const input = document.querySelector('input[type="range"][aria-label="推理强度"]');
          const body = document.body;
          return {
            selected: input?.getAttribute('aria-valuetext') || null,
            disabled: input instanceof HTMLInputElement ? input.disabled : null,
            active: body?.classList.contains(${JSON.stringify(expectedTheme.activeClass)}) ?? false,
            styleTag: Boolean(document.querySelector('style[data-plugin-css="dsh-whale-mist/theme.css"]')),
            pluginMounted: Boolean(document.querySelector('.re-effort')),
          };
        })()`);
        if (afterEffortSwitch.disabled === false
          && ['off', 'high', 'max'].includes(afterEffortSwitch.selected)) break;
        await delay(100);
      }
      await delay(500);
      afterEffortSwitch = await evaluate(`(() => {
        const input = document.querySelector('input[type="range"][aria-label="推理强度"]');
        const canvas = document.querySelector('.re-effort-canvas');
        const track = document.querySelector('.re-effort-track');
        const flare = document.querySelector('.re-effort-flare');
        const effects = document.querySelector('.re-effort-fx');
        const slider = document.querySelector('.re-effort-slider');
        const body = document.body;
        const finishPaletteTransitions = () => {
          if (!(effects instanceof HTMLElement)) return;
          void getComputedStyle(effects, '::after').opacity;
          effects.getAnimations({ subtree: true }).forEach(animation => animation.finish());
        };
        const previousEffort = slider instanceof HTMLElement ? slider.dataset.effort : undefined;
        if (slider instanceof HTMLElement) slider.dataset.effort = 'off';
        finishPaletteTransitions();
        const offTrackBackground = track ? getComputedStyle(track).backgroundImage : null;
        const offOverlayOpacity = effects ? getComputedStyle(effects, '::after').opacity : null;
        if (slider instanceof HTMLElement) {
          if (previousEffort === undefined) delete slider.dataset.effort;
          else slider.dataset.effort = previousEffort;
        }
        finishPaletteTransitions();
        return {
          selected: input?.getAttribute('aria-valuetext') || null,
          disabled: input instanceof HTMLInputElement ? input.disabled : null,
          active: body?.classList.contains(${JSON.stringify(expectedTheme.activeClass)}) ?? false,
          darkMode: body?.hasAttribute('data-ds-dark-theme') ?? false,
          styleTag: Boolean(document.querySelector('style[data-plugin-css="dsh-whale-mist/theme.css"]')),
          pluginMounted: Boolean(document.querySelector('.re-effort')),
          canvasFilter: canvas ? getComputedStyle(canvas).filter : null,
          canvasBlendMode: canvas ? getComputedStyle(canvas).mixBlendMode : null,
          trackBackground: track ? getComputedStyle(track).backgroundImage : null,
          fillBackground: track ? getComputedStyle(track, '::before').backgroundImage : null,
          flareBackground: flare ? getComputedStyle(flare).backgroundImage : null,
          flareAccentBackground: flare ? getComputedStyle(flare, '::before').backgroundImage : null,
          paletteOverlay: effects ? getComputedStyle(effects, '::after').backgroundImage : null,
          offTrackBackground,
          offOverlayOpacity,
        };
      })()`);
      if (!['off', 'high', 'max'].includes(afterEffortSwitch.selected)
        || afterEffortSwitch.disabled !== false
        || !afterEffortSwitch.active
        || !afterEffortSwitch.styleTag
        || !afterEffortSwitch.pluginMounted) {
        throw new Error(`Reasoning effort switch lost selection or Whale Mist: ${JSON.stringify({ effortTarget, afterEffortSwitch })}`);
      }
      if (expectedThemeId === "whale-mist") {
        if (!afterEffortSwitch.canvasFilter?.includes('hue-rotate')
          || !afterEffortSwitch.trackBackground?.includes('linear-gradient')
          || afterEffortSwitch.paletteOverlay === 'none') {
          throw new Error(`Reasoning effort Whale Mist palette is incomplete: ${JSON.stringify(afterEffortSwitch)}`);
        }
        if (afterEffortSwitch.canvasBlendMode !== 'multiply'
          || !afterEffortSwitch.fillBackground?.includes('rgb(233, 220, 255)')
          || afterEffortSwitch.fillBackground?.includes('rgb(255, 255, 255)')
          || afterEffortSwitch.flareAccentBackground?.includes('rgb(255, 255, 255)')) {
          throw new Error(`Reasoning effort wave is not violet from tail to crest: ${JSON.stringify(afterEffortSwitch)}`);
        }
        if (!afterEffortSwitch.offTrackBackground?.includes('rgb(248, 252, 255)')
          || afterEffortSwitch.offOverlayOpacity !== '0') {
          throw new Error(`Reasoning effort off state is not a quiet Whale Mist surface: ${JSON.stringify(afterEffortSwitch)}`);
        }
      } else if (!afterEffortSwitch.darkMode
        || afterEffortSwitch.canvasBlendMode !== 'screen'
        || !afterEffortSwitch.trackBackground?.includes('linear-gradient')) {
        throw new Error(`Reasoning effort did not retain its dark radiation under Whale Abyss: ${JSON.stringify(afterEffortSwitch)}`);
      }
      reasoningEffortSelected = afterEffortSwitch.selected;
      const reasoningClip = await evaluate(`(() => {
        const menu = document.querySelector('.re-model-menu');
        if (!(menu instanceof HTMLElement)) return null;
        const rect = menu.getBoundingClientRect();
        const padding = 8;
        return {
          x: Math.max(0, rect.left - padding),
          y: Math.max(0, rect.top - padding),
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          scale: 1,
        };
      })()`);
      if (!reasoningClip) throw new Error("Reasoning effort menu is missing during palette capture.");
      const reasoningCapture = await cdp("Page.captureScreenshot", { format: "png", clip: reasoningClip });
      await writeFile(reasoningOutput, Buffer.from(reasoningCapture.data, "base64"));
    }
    let imageDropAccepted = null;
    if (process.env.DSH_EXPECT_IMAGE_DROP === "1") {
      const beforeDrop = await evaluate(`document.querySelectorAll('img[src^="blob:"]').length`);
      const dragStarted = await evaluate(`(() => {
        const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=';
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const file = new File([bytes], 'drag-drop-qa.png', { type: 'image/png' });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        window.__dshImageDropQaTransfer = transfer;
        return document.dispatchEvent(new DragEvent('dragenter', {
          bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 720, clientY: 480,
        })) === false;
      })()`);
      if (!dragStarted) throw new Error("Official composer did not prevent the synthetic image dragenter event.");
      await delay(120);
      const overlayVisible = await evaluate(`/((拖放|拖入|Drop).*(图片|image)|(图片|image).*(拖动|拖放|拖入|drop))/i.test(document.body?.innerText || '')`);
      if (!overlayVisible) throw new Error("Official image drop overlay did not appear after dragenter.");
      const dropAccepted = await evaluate(`(() => {
        const transfer = window.__dshImageDropQaTransfer;
        if (!(transfer instanceof DataTransfer)) return false;
        document.dispatchEvent(new DragEvent('dragover', {
          bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 720, clientY: 480,
        }));
        const prevented = document.dispatchEvent(new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 720, clientY: 480,
        })) === false;
        delete window.__dshImageDropQaTransfer;
        return prevented;
      })()`);
      if (!dropAccepted) throw new Error("Official composer did not prevent the synthetic image drop event.");
      let preview = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        preview = await evaluate(`(() => {
          const image = [...document.querySelectorAll('img[src^="blob:"]')]
            .find((candidate) => /drag-drop-qa\.png/i.test(candidate.alt || candidate.getAttribute('aria-label') || ''));
          return image ? { src: image.src, alt: image.alt } : null;
        })()`);
        if (preview) break;
        await delay(100);
      }
      if (!preview || beforeDrop >= await evaluate(`document.querySelectorAll('img[src^="blob:"]').length`)) {
        throw new Error(`Dropped image preview did not enter the composer: ${JSON.stringify({ beforeDrop, preview })}`);
      }
      imageDropAccepted = true;
    }
    let archivedSessionsVisible = null;
    if (process.env.DSH_EXPECT_ARCHIVED_SESSIONS === "1") {
      const settingsTarget = await evaluate(`(() => {
        const element = [...document.querySelectorAll('button')]
          .find((button) => /^(设置|Settings)$/.test((button.textContent || '').trim()));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!settingsTarget) throw new Error("Settings trigger is missing during plugin visibility QA.");
      await clickAt(settingsTarget);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        archivedSessionsVisible = await evaluate(`/(会话管理|Session management|归档会话|No archived sessions|Archived)/i.test(document.body?.innerText || '')`);
        if (archivedSessionsVisible) break;
        await delay(100);
      }
      if (!archivedSessionsVisible) throw new Error("Archived Sessions did not register in Settings.");
    }
    let themeSwitch = null;
    if (process.env.DSH_EXPECT_THEME_SWITCH === "1") {
      const settingsTarget = await evaluate(`(() => {
        const element = [...document.querySelectorAll('button')]
          .find((button) => /^(设置|Settings)$/.test((button.textContent || '').trim()));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!settingsTarget) throw new Error("Settings trigger is missing during Whale theme switch QA.");
      await clickAt(settingsTarget);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await evaluate(`Boolean(document.querySelector('[data-wm-settings]'))`)) break;
        await delay(100);
      }
      const selectTheme = async (themeSetting) => {
        const target = await evaluate(`(() => {
          const element = document.querySelector('[data-wm-setting="theme"][data-wm-value="${themeSetting}"]');
          if (!element) return null;
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
          const rect = element.getBoundingClientRect();
          const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          const hit = document.elementFromPoint(center.x, center.y);
          return { ...center, hit: Boolean(hit && (hit === element || element.contains(hit))) };
        })()`);
        if (!target?.hit) throw new Error(`Whale theme option ${themeSetting} is not usable: ${JSON.stringify(target)}`);
        await clickAt(target);
        await delay(240);
      };
      const readSelectedTheme = async (themeId, themeConfig) => evaluate(`(() => {
        const body = document.body;
        const stored = JSON.parse(localStorage.getItem('dsh-whale-mist.appearance.v1') || 'null');
        return {
          active: body?.classList.contains(${JSON.stringify(themeConfig.activeClass)}) ?? false,
          darkMode: body?.hasAttribute('data-ds-dark-theme') ?? false,
          theme: body?.dataset.wmTheme,
          brand: getComputedStyle(body).getPropertyValue('--dsw-alias-brand-primary').trim().toLowerCase(),
          storedTheme: stored?.theme,
          themeId: ${JSON.stringify(themeId)},
        };
      })()`);
      await selectTheme(alternateTheme.setting);
      const alternate = await readSelectedTheme(alternateThemeId, alternateTheme);
      if (!alternate.active
        || alternate.darkMode !== (alternateTheme.colorScheme === "dark")
        || alternate.theme !== alternateTheme.setting
        || alternate.brand !== alternateTheme.brand
        || alternate.storedTheme !== alternateTheme.setting) {
        throw new Error(`Whale theme did not switch to ${alternateThemeId}: ${JSON.stringify(alternate)}`);
      }
      await selectTheme(expectedTheme.setting);
      const restored = await readSelectedTheme(expectedThemeId, expectedTheme);
      if (!restored.active
        || restored.darkMode !== (expectedTheme.colorScheme === "dark")
        || restored.theme !== expectedTheme.setting
        || restored.brand !== expectedTheme.brand
        || restored.storedTheme !== expectedTheme.setting) {
        throw new Error(`Whale theme did not switch back to ${expectedThemeId}: ${JSON.stringify(restored)}`);
      }
      themeSwitch = { alternate, restored };
    }
    console.log(`PASS ${expectedThemeId} theme retention: ${JSON.stringify({ initial, recoveredTheme, anchoredStandardVisible, visionModelSelected, reasoningEffortSelected, reasoningScreenshot: reasoningEffortSelected ? reasoningOutput : null, imageDropAccepted, archivedSessionsVisible, themeSwitch, shellScreenshot })}`);
    break main;
  }

  await clickAt(initial);
  await delay(420);
  const collapsed = await evaluate(uiState);
  if (!collapsed.ready || !collapsed.active || !collapsed.inputFillOpaque || !collapsed.hit || collapsed.width < 28 || collapsed.height < 28) {
    throw new Error(`Collapsed official sidebar toggle is not usable: ${JSON.stringify(collapsed)}`);
  }
  if (collapsed.ariaLabel === initial.ariaLabel) {
    throw new Error(`Sidebar label did not change after collapse: ${JSON.stringify({ initial, collapsed })}`);
  }

  await clickAt(collapsed);
  await delay(420);
  const expanded = await evaluate(uiState);
  if (!expanded.ready || !expanded.active || !expanded.inputFillOpaque || !expanded.hit || expanded.width < 28 || expanded.height < 28) {
    throw new Error(`Official sidebar did not expand again: ${JSON.stringify(expanded)}`);
  }
  if (expanded.ariaLabel !== initial.ariaLabel) {
    throw new Error(`Sidebar did not return to its initial state: ${JSON.stringify({ initial, expanded })}`);
  }

  const sidebarControls = await evaluate(`(() => [...document.querySelectorAll('button, a, [role], [tabindex]')]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: (element.textContent || '').replace(/\\s+/g, ' ').trim(),
        aria: element.getAttribute('aria-label'),
        role: element.getAttribute('role'),
        tabIndex: element.getAttribute('tabindex'),
        cursor: getComputedStyle(element).cursor,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((item) => item.x < 280 && item.y > 90 && item.width > 0 && item.height > 0 && (item.text || item.aria))
    .slice(0, 40))()`);

  const sessionTarget = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[role="treeitem"]')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { element, rect, text: (element.textContent || '').replace(/\\s+/g, ' ').trim() };
      })
      .filter((item) => item.rect.width > 0 && item.rect.height > 0 && !/^新会话$|^New session$/i.test(item.text));
    const target = rows.find((item) => /\\d+\\s*(分钟|小时|天|minute|hour|day)/i.test(item.text)) ?? rows[1];
    if (!target) return null;
    const center = { x: target.rect.left + target.rect.width / 2, y: target.rect.top + target.rect.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    return { text: target.text, x: center.x, y: center.y, hit: Boolean(hit && (hit === target.element || target.element.contains(hit))) };
  })()`);

  if (!sessionTarget?.hit) {
    throw new Error(`No usable existing Session row was found: ${JSON.stringify({ sessionTarget, sidebarControls })}`);
  }
  await clickAt(sessionTarget);

  let conversation;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    conversation = await evaluate(`(() => {
      const textarea = document.querySelector('textarea');
      const pageText = document.body?.innerText || '';
      const historySettled = !/载入历史|Loading history/i.test(pageText) && pageText.length > 500;
      const controls = [...document.querySelectorAll('button, [role="tab"]')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { element, rect, text: (element.textContent || '').replace(/\\s+/g, ' ').trim() };
        });
      const chatTab = controls.find((item) => item.text === '对话' || /^Chat$/i.test(item.text));
      const trajectoryTab = controls.find((item) => item.text === '轨迹' || /^Trajectory$/i.test(item.text));
      let card = textarea?.parentElement;
      while (card && card !== document.body) {
        const style = getComputedStyle(card);
        if (style.backgroundImage !== 'none' && parseFloat(style.borderRadius) >= 16) break;
        card = card.parentElement;
      }
      if (!textarea || !card || !chatTab || !trajectoryTab || !historySettled) return { ready: false, historySettled };
      const cardStyle = getComputedStyle(card);
      const cardRect = card.getBoundingClientRect();
      const trajectoryCenter = {
        x: trajectoryTab.rect.left + trajectoryTab.rect.width / 2,
        y: trajectoryTab.rect.top + trajectoryTab.rect.height / 2,
      };
      const topSample = document.elementFromPoint(cardRect.left + cardRect.width / 2, cardRect.top + 12);
      return {
        ready: true,
        inputBackground: cardStyle.backgroundImage,
        inputOpaque: cardStyle.backgroundImage.includes('linear-gradient'),
        inputCoversTopSample: Boolean(topSample && (topSample === card || card.contains(topSample))),
        inputRect: { x: cardRect.left, y: cardRect.top, width: cardRect.width, height: cardRect.height },
        tabs: controls.filter((item) => item.text === '对话' || item.text === '轨迹' || /^Chat$|^Trajectory$/i.test(item.text)).map((item) => item.text),
        trajectory: trajectoryCenter,
      };
    })()`);
    if (conversation?.ready) break;
    await delay(100);
  }

  if (!conversation?.ready || !conversation.inputOpaque || !conversation.inputCoversTopSample) {
    throw new Error(`Conversation composer is not an opaque covering surface: ${JSON.stringify(conversation)}`);
  }

  const readWhaleStatus = `(() => {
    const element = document.querySelector('[data-wm-status]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      state: element.dataset.wmStatus,
      label: (element.textContent || '').trim(),
      ariaLabel: element.getAttribute('aria-label'),
      ariaLive: element.getAttribute('aria-live'),
      width: rect.width,
      height: rect.height,
      hasWhale: Boolean(element.querySelector('svg path')),
      pointerEvents: getComputedStyle(element).pointerEvents,
    };
  })()`;

  await evaluate(`window.dispatchEvent(new CustomEvent('dsh-whale-mist:qa-status', { detail: 'running' }))`);
  await delay(220);
  const runningStatus = await evaluate(readWhaleStatus);
  if (runningStatus?.state !== "running" || !runningStatus.hasWhale || runningStatus.height !== 26 || runningStatus.ariaLive !== "polite") {
    throw new Error(`Running whale status is incomplete: ${JSON.stringify(runningStatus)}`);
  }

  await evaluate(`window.dispatchEvent(new CustomEvent('dsh-whale-mist:qa-status', { detail: 'waiting' }))`);
  await delay(180);
  const waitingStatus = await evaluate(readWhaleStatus);
  if (waitingStatus?.state !== "waiting" || !waitingStatus.hasWhale || waitingStatus.pointerEvents !== "none") {
    throw new Error(`Waiting whale status is incomplete: ${JSON.stringify(waitingStatus)}`);
  }
  const statusCapture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(statusOutput, Buffer.from(statusCapture.data, "base64"));

  await evaluate(`window.dispatchEvent(new CustomEvent('dsh-whale-mist:qa-status', { detail: 'idle' }))`);
  await delay(80);
  const completeStatus = await evaluate(readWhaleStatus);
  if (completeStatus?.state !== "complete" || !completeStatus.hasWhale) {
    throw new Error(`Completion whale status did not appear: ${JSON.stringify(completeStatus)}`);
  }
  await delay(1450);
  const clearedStatus = await evaluate(readWhaleStatus);
  if (clearedStatus !== null) {
    throw new Error(`Completion whale status did not clear: ${JSON.stringify(clearedStatus)}`);
  }
  await evaluate(`window.dispatchEvent(new CustomEvent('dsh-whale-mist:qa-status', { detail: null }))`);

  const capture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(output, Buffer.from(capture.data, "base64"));

  await clickAt(conversation.trajectory);
  await delay(650);
  const trajectory = await evaluate(`(() => {
    const text = document.body?.innerText || '';
    const hasTimelineControls = /Duration/.test(text) && /Turns/.test(text) && /Calls/.test(text);
    const tabs = [...document.querySelectorAll('button, [role="tab"]')]
      .filter((element) => ['轨迹', 'Trajectory'].includes((element.textContent || '').trim()));
    return { hasTimelineControls, trajectoryTabCount: tabs.length };
  })()`);
  if (!trajectory.hasTimelineControls || trajectory.trajectoryTabCount === 0) {
    throw new Error(`Trajectory did not render as a separate view: ${JSON.stringify(trajectory)}`);
  }
  const trajectoryCapture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(trajectoryOutput, Buffer.from(trajectoryCapture.data, "base64"));

  const settingsTarget = await evaluate(`(() => {
    const element = [...document.querySelectorAll('button')]
      .find((button) => /^(设置|Settings)$/.test((button.textContent || '').trim()));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    return { x: center.x, y: center.y, hit: Boolean(hit && (hit === element || element.contains(hit))) };
  })()`);
  if (!settingsTarget?.hit) throw new Error(`Settings trigger is not usable: ${JSON.stringify(settingsTarget)}`);
  await clickAt(settingsTarget);

  let appearance;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    appearance = await evaluate(`(() => {
      const panel = document.querySelector('[data-wm-settings]');
      if (!panel) return { ready: false };
      return {
        ready: true,
        rows: panel.querySelectorAll('.wm-settings-row').length,
        options: panel.querySelectorAll('[data-wm-setting]').length,
        selected: panel.querySelectorAll('[data-wm-setting][aria-pressed="true"]').length,
        theme: document.body.dataset.wmTheme,
        canvas: document.body.dataset.wmCanvas,
        sidebar: document.body.dataset.wmSidebar,
        glass: document.body.dataset.wmGlass,
      };
    })()`);
    if (appearance?.ready) break;
    await delay(100);
  }
  if (!appearance?.ready || appearance.rows !== 4 || appearance.options !== 8 || appearance.selected !== 4
    || appearance.theme !== expectedTheme.setting) {
    throw new Error(`Whale appearance settings panel is incomplete: ${JSON.stringify(appearance)}`);
  }

  const settingsCapture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(settingsOutput, Buffer.from(settingsCapture.data, "base64"));

  const deepOption = await evaluate(`(() => {
    const element = document.querySelector('[data-wm-setting="sidebar"][data-wm-value="deep"]');
    if (!element) return null;
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    return { x: center.x, y: center.y, hit: Boolean(hit && (hit === element || element.contains(hit))) };
  })()`);
  if (!deepOption?.hit) throw new Error(`Deep sidebar option is not usable: ${JSON.stringify(deepOption)}`);
  await clickAt(deepOption);
  await delay(180);
  const deepApplied = await evaluate(`(() => ({
    theme: document.body.dataset.wmTheme,
    sidebar: document.body.dataset.wmSidebar,
    fill: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    stored: JSON.parse(localStorage.getItem('dsh-whale-mist.appearance.v1') || 'null'),
  }))()`);
  if (deepApplied.theme !== expectedTheme.setting || deepApplied.stored?.theme !== expectedTheme.setting
    || deepApplied.sidebar !== "deep" || deepApplied.stored?.sidebar !== "deep"
    || !deepApplied.fill.includes(expectedTheme.deepSidebarFragment)) {
    throw new Error(`Deep sidebar option did not apply: ${JSON.stringify(deepApplied)}`);
  }

  await cdp("Page.reload", { ignoreCache: true });
  await delay(2300);
  const persisted = await evaluate(`(() => ({
    active: document.body?.classList.contains(${JSON.stringify(expectedTheme.activeClass)}),
    theme: document.body?.dataset.wmTheme,
    sidebar: document.body?.dataset.wmSidebar,
    stored: JSON.parse(localStorage.getItem('dsh-whale-mist.appearance.v1') || 'null'),
  }))()`);
  if (!persisted.active || persisted.theme !== expectedTheme.setting || persisted.stored?.theme !== expectedTheme.setting
    || persisted.sidebar !== "deep" || persisted.stored?.sidebar !== "deep") {
    throw new Error(`Whale appearance settings did not survive reload: ${JSON.stringify(persisted)}`);
  }

  const settingsAgain = await evaluate(`(() => {
    const element = [...document.querySelectorAll('button')]
      .find((button) => /^(设置|Settings)$/.test((button.textContent || '').trim()));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!settingsAgain) throw new Error("Settings trigger disappeared after reload.");
  await clickAt(settingsAgain);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector('.wm-settings-reset'))`)) break;
    await delay(100);
  }
  const resetTarget = await evaluate(`(() => {
    const element = document.querySelector('.wm-settings-reset');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!resetTarget) throw new Error("Whale Mist reset control is missing after reload.");
  await clickAt(resetTarget);
  await delay(180);
  const reset = await evaluate(`(() => ({
    theme: document.body.dataset.wmTheme,
    canvas: document.body.dataset.wmCanvas,
    sidebar: document.body.dataset.wmSidebar,
    glass: document.body.dataset.wmGlass,
    abyssActive: document.body.classList.contains('dsh-whale-abyss-active'),
    darkMode: document.body.hasAttribute('data-ds-dark-theme'),
    selected: document.querySelectorAll('[data-wm-setting][aria-pressed="true"]').length,
  }))()`);
  if (reset.theme !== "abyss" || !reset.abyssActive || !reset.darkMode
    || reset.canvas !== "soft" || reset.sidebar !== "balanced" || reset.glass !== "standard" || reset.selected !== 4) {
    throw new Error(`Reset did not restore Whale appearance defaults: ${JSON.stringify(reset)}`);
  }

  console.log(`PASS ${expectedThemeId} official UI: ${JSON.stringify({ initial, recoveredTheme, collapsed, expanded, sessionTarget, conversation, status: { runningStatus, waitingStatus, completeStatus, clearedStatus }, trajectory, appearance, deepApplied, persisted, reset, screenshots: [output, statusOutput, trajectoryOutput, settingsOutput] })}`);
} finally {
  try {
    await Promise.race([cdp("Browser.close"), delay(1000)]);
  } catch {}
  socket.close();
  browser.kill();
}
}
