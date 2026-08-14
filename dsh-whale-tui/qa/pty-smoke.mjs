import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const nodePtyPath = process.argv[2];
if (!nodePtyPath) {
  throw new Error("用法：node qa/pty-smoke.mjs <node-pty 包目录>");
}

const require = createRequire(import.meta.url);
const pty = require(path.resolve(nodePtyPath));
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..", "..");
const npxNodeModules = path.dirname(path.resolve(nodePtyPath));
const dshEntry = path.join(npxNodeModules, "@deepseek-ai", "dsh", "lib", "bin.js");
const dshArgs = [dshEntry, "--profile", "tui", "--no-alt-screen"];
if (process.argv.includes("--resume-latest")) dshArgs.push("--resume", "latest");
dshArgs.push("/exit");
const child = pty.spawn(process.execPath, dshArgs, {
  name: "xterm-256color",
  cols: 100,
  rows: 30,
  cwd: workspace,
  env: { ...process.env, NO_COLOR: "1", DSH_WHALE_TUI_DEBUG: "1" }
});

let output = "";
let sawBrand = false;
let completed = false;

const timeout = setTimeout(() => {
  if (completed) return;
  child.kill();
  const tail = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").slice(-1200);
  process.stderr.write(`Whale TUI PTY smoke test timed out.\n${tail}\n`);
  setTimeout(() => process.exit(1), 500);
}, 45_000);

child.onData((data) => {
  if (output.length < 2_000_000) output += data;
  if (output.includes("WHALE TUI")) sawBrand = true;
});

child.onExit(({ exitCode }) => {
  completed = true;
  clearTimeout(timeout);
  try {
    assert.equal(exitCode, 0);
    assert.equal(sawBrand, true, "TUI brand was not rendered");
    assert.match(output, /对话/);
    assert.match(output, /轨迹/);
    assert.match(output, /deepseek-official \/ deepseek-v4-flash/);
    assert.match(output, /\u001b\[\?2004h/, "bracketed paste mode was not enabled");
    assert.match(output, /\u001b\[\?2004l/, "bracketed paste mode was not restored");
    assert.doesNotMatch(output, /\u001b\[\?1049h/, "--no-alt-screen was ignored");
    process.stdout.write("Whale TUI PTY smoke test passed.\n");
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
});
