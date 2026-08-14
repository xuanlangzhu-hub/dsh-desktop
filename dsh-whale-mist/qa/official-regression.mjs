import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const appUrl = process.env.DSH_TEST_URL ?? "http://127.0.0.1:3080/";
const launchUrl = new URL(appUrl);
launchUrl.searchParams.set("wm-status-qa", "1");
const debugPort = 9400 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), "dsh-whale-mist-official-"));
const output = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist.png");
const trajectoryOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-trajectory.png");
const settingsOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-settings.png");
const statusOutput = join(dirname(fileURLToPath(import.meta.url)), "official-whale-mist-status.png");
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-sync",
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
  if (!body) return { ready: false, stage: 'document-loading' };
  const candidates = [...document.querySelectorAll('button[aria-label]')];
  const toggle = candidates.find(button => /侧边栏|sidebar/i.test(button.getAttribute('aria-label') || ''));
  const bodyStyle = getComputedStyle(body);
  if (!toggle) {
    return {
      ready: false,
      active: body.classList.contains('dsh-whale-mist-active'),
      labels: candidates.map(button => button.getAttribute('aria-label')).filter(Boolean).slice(0, 30),
    };
  }
  const rect = toggle.getBoundingClientRect();
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const hit = rect.width > 0 && rect.height > 0 ? document.elementFromPoint(center.x, center.y) : null;
  return {
    ready: true,
    active: body.classList.contains('dsh-whale-mist-active'),
    styleTag: Boolean(document.querySelector('style[data-plugin-css="dsh-whale-mist/theme.css"]')),
    ariaLabel: toggle.getAttribute('aria-label'),
    width: rect.width,
    height: rect.height,
    x: center.x,
    y: center.y,
    hit: Boolean(hit && (hit === toggle || toggle.contains(hit))),
    sidebarFill: bodyStyle.getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    inputFill: bodyStyle.getPropertyValue('--dsw-specific-input-major').trim(),
    inputFillOpaque: /^(linear-gradient|#|rgb\([^,]+,[^,]+,[^)]+\)$)/.test(bodyStyle.getPropertyValue('--dsw-specific-input-major').trim()),
    brand: bodyStyle.getPropertyValue('--dsw-alias-brand-primary').trim(),
  };
})()`;

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

  if (!initial?.ready || !initial.active || !initial.styleTag || !initial.inputFillOpaque) {
    throw new Error(`Whale Mist did not become active: ${JSON.stringify(initial)}`);
  }
  if (!initial.hit || initial.width < 28 || initial.height < 28) {
    throw new Error(`Initial official sidebar toggle is not usable: ${JSON.stringify(initial)}`);
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
        canvas: document.body.dataset.wmCanvas,
        sidebar: document.body.dataset.wmSidebar,
        glass: document.body.dataset.wmGlass,
      };
    })()`);
    if (appearance?.ready) break;
    await delay(100);
  }
  if (!appearance?.ready || appearance.rows !== 3 || appearance.options !== 6 || appearance.selected !== 3) {
    throw new Error(`Whale Mist settings panel is incomplete: ${JSON.stringify(appearance)}`);
  }

  const settingsCapture = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(settingsOutput, Buffer.from(settingsCapture.data, "base64"));

  const deepOption = await evaluate(`(() => {
    const element = document.querySelector('[data-wm-setting="sidebar"][data-wm-value="deep"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!deepOption) throw new Error("Deep sidebar option is missing.");
  await clickAt(deepOption);
  await delay(180);
  const deepApplied = await evaluate(`(() => ({
    sidebar: document.body.dataset.wmSidebar,
    fill: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    stored: JSON.parse(localStorage.getItem('dsh-whale-mist.appearance.v1') || 'null'),
  }))()`);
  if (deepApplied.sidebar !== "deep" || deepApplied.stored?.sidebar !== "deep" || !deepApplied.fill.includes("207")) {
    throw new Error(`Deep sidebar option did not apply: ${JSON.stringify(deepApplied)}`);
  }

  await cdp("Page.reload", { ignoreCache: true });
  await delay(2300);
  const persisted = await evaluate(`(() => ({
    active: document.body?.classList.contains('dsh-whale-mist-active'),
    sidebar: document.body?.dataset.wmSidebar,
    stored: JSON.parse(localStorage.getItem('dsh-whale-mist.appearance.v1') || 'null'),
  }))()`);
  if (!persisted.active || persisted.sidebar !== "deep" || persisted.stored?.sidebar !== "deep") {
    throw new Error(`Whale Mist settings did not survive reload: ${JSON.stringify(persisted)}`);
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
    canvas: document.body.dataset.wmCanvas,
    sidebar: document.body.dataset.wmSidebar,
    glass: document.body.dataset.wmGlass,
    selected: document.querySelectorAll('[data-wm-setting][aria-pressed="true"]').length,
  }))()`);
  if (reset.canvas !== "soft" || reset.sidebar !== "balanced" || reset.glass !== "standard" || reset.selected !== 3) {
    throw new Error(`Reset did not restore Whale Mist defaults: ${JSON.stringify(reset)}`);
  }

  console.log(`PASS Whale Mist official UI: ${JSON.stringify({ initial, collapsed, expanded, sessionTarget, conversation, status: { runningStatus, waitingStatus, completeStatus, clearedStatus }, trajectory, appearance, deepApplied, persisted, reset, screenshots: [output, statusOutput, trajectoryOutput, settingsOutput] })}`);
} finally {
  try {
    await Promise.race([cdp("Browser.close"), delay(1000)]);
  } catch {}
  socket.close();
  browser.kill();
}
