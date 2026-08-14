import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 9347;
const profile = await mkdtemp(join(tmpdir(), "whale-mist-sidebar-"));
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--disable-default-apps",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "--window-size=1200,800",
  "http://127.0.0.1:4173/",
], { stdio: "ignore" });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findPage() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json());
      const page = targets.find(target => target.type === "page" && target.url.startsWith("http://127.0.0.1:4173/"));
      if (page) return page;
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for the Whale Mist page.");
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

const toggleState = `(() => {
  const shell = document.querySelector('.app-shell');
  const button = document.querySelector('[data-action="toggle-sidebar"]');
  if (!shell || !button) return { ready: false };
  const style = getComputedStyle(button);
  const rect = button.getBoundingClientRect();
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const hit = rect.width > 0 && rect.height > 0 ? document.elementFromPoint(center.x, center.y) : null;
  return {
    ready: true,
    compact: shell.classList.contains('sidebar-compact'),
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    width: rect.width,
    height: rect.height,
    x: center.x,
    y: center.y,
    hit: Boolean(hit && (hit === button || button.contains(hit))),
    ariaLabel: button.getAttribute('aria-label'),
  };
})()`;

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await evaluate(toggleState);
    if (state?.ready) break;
    await delay(100);
  }

  const initial = await evaluate(toggleState);
  if (!initial.ready || initial.compact || !initial.hit) {
    throw new Error(`Initial sidebar toggle is not usable: ${JSON.stringify(initial)}`);
  }

  await clickAt(initial);
  await delay(260);
  const collapsed = await evaluate(toggleState);
  if (!collapsed.compact || collapsed.display === "none" || collapsed.visibility === "hidden" || collapsed.width === 0 || !collapsed.hit) {
    throw new Error(`Collapsed sidebar toggle is not usable: ${JSON.stringify(collapsed)}`);
  }

  await clickAt(collapsed);
  await delay(260);
  const expanded = await evaluate(toggleState);
  if (expanded.compact || expanded.display === "none" || expanded.width === 0 || !expanded.hit) {
    throw new Error(`Sidebar did not expand again: ${JSON.stringify(expanded)}`);
  }

  console.log(`PASS sidebar collapse/expand: ${JSON.stringify({ initial, collapsed, expanded })}`);
} finally {
  socket.close();
  browser.kill();
}
