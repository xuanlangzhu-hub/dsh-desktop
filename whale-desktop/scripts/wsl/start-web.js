#!/usr/bin/env node
/**
 * WSL backend launcher for Whale Harness Desktop.
 *
 * Spawns the Linux dsh web server as a detached process-group leader, records
 * its PID in a pidfile, forwards SIGTERM/SIGINT to the whole group, and waits.
 * The companion stop-web.js reads the same pidfile so the Windows desktop can
 * stop the backend even when the original wsl.exe launcher is gone.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function fail(message) {
  process.stderr.write(`whale-wsl start-web: ${message}\n`);
  process.exit(1);
}

const HOME = process.env.HOME;
if (!HOME) fail("HOME is not set");
const RUNTIME_ROOT = process.env.WHALE_WSL_RUNTIME || join(HOME, ".local", "share", "whale-harness", "runtime");
const NODE = process.env.WHALE_WSL_NODE || join(RUNTIME_ROOT, "node", "bin", "node");
const ENTRY = process.env.WHALE_WSL_ENTRY || join(RUNTIME_ROOT, "dsh", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
const PROFILE = process.env.WHALE_WSL_PROFILE || "whale-desktop-wsl";
const PORT = process.env.WHALE_WSL_PORT || "3210";
const HOST = process.env.WHALE_WSL_HOST || "127.0.0.1";
const WORKSPACE = process.env.WHALE_WSL_WORKSPACE || HOME;
const DSH_HOME = process.env.WHALE_WSL_DSH_HOME || join(HOME, ".dsh");
const LOG_DIR = process.env.WHALE_WSL_LOG_DIR || join(RUNTIME_ROOT, "logs");
const PID_FILE = process.env.WHALE_WSL_PID_FILE || join(RUNTIME_ROOT, "run", "dsh-web.pid");
const LAUNCH_LOG = process.env.WHALE_WSL_LAUNCH_LOG || join(LOG_DIR, "dsh-web.launch.log");
// Node 24 does not consume HTTP_PROXY/HTTPS_PROXY for fetch unless this flag is
// enabled. WSL commonly inherits a Windows loopback proxy while its own DNS is
// unavailable, so leaving the flag off makes dsh requests time out even though
// curl works. It is harmless when no proxy variables are configured.
const NODE_USE_ENV_PROXY = process.env.NODE_USE_ENV_PROXY || "1";

for (const file of [NODE, ENTRY]) {
  if (!existsSync(file)) fail(`required file is missing: ${file}`);
}
if (!/^(127\.0\.0\.1|localhost)$/.test(HOST)) {
  fail(`refusing to bind to non-loopback host ${HOST}; only 127.0.0.1 is allowed`);
}
if (!/^\d{1,5}$/.test(PORT)) fail(`invalid port: ${PORT}`);

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(join(RUNTIME_ROOT, "run"), { recursive: true });

if (existsSync(PID_FILE)) {
  let stale = true;
  try {
    const previous = Number.parseInt(readFileSync(PID_FILE, "utf8"), 10);
    if (Number.isInteger(previous) && previous > 0) {
      try {
        process.kill(previous, 0);
        fail(`a WSL dsh backend is already running (pid ${previous}); stop it first or remove ${PID_FILE}`);
      } catch {
        stale = true;
      }
    }
  } catch {
    stale = true;
  }
  if (stale) rmSync(PID_FILE, { force: true });
}

const stdoutFd = openSync(join(LOG_DIR, "dsh-web.stdout.log"), "a");
const stderrFd = openSync(join(LOG_DIR, "dsh-web.stderr.log"), "a");

writeFileSync(LAUNCH_LOG, [
  `node=${NODE}`,
  `entry=${ENTRY}`,
  `profile=${PROFILE}`,
  `dshHome=${DSH_HOME}`,
  `workspace=${WORKSPACE}`,
  `host=${HOST}`,
  `port=${PORT}`,
  `nodeUseEnvProxy=${NODE_USE_ENV_PROXY}`,
  `pidFile=${PID_FILE}`,
  `startedAt=${new Date().toISOString()}`,
  "",
].join("\n"), "utf8");

const child = spawn(NODE, [ENTRY, "--profile", PROFILE, "--no-open", "--host", HOST, "--port", PORT], {
  cwd: WORKSPACE,
  env: {
    ...process.env,
    DSH_HOME,
    NO_COLOR: "1",
    NODE_USE_ENV_PROXY,
    WHALE_HARNESS_DESKTOP: "1",
  },
  detached: true,
  stdio: ["ignore", stdoutFd, stderrFd],
});

writeFileSync(PID_FILE, `${child.pid}\n`, "utf8");
process.stdout.write(`whale-wsl dsh web started (pid ${child.pid}, profile ${PROFILE}, http://${HOST}:${PORT})\n`);

let stopping = false;
let forceTimer;
const stopGroup = (signal) => {
  if (stopping) return;
  stopping = true;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The group may already be gone.
  }
  forceTimer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Nothing left to kill.
    }
  }, 5000);
  forceTimer.unref();
};

process.on("SIGTERM", () => stopGroup("SIGTERM"));
process.on("SIGINT", () => stopGroup("SIGINT"));

child.on("error", (error) => {
  clearTimeout(forceTimer);
  fail(`failed to spawn dsh web: ${String(error.message ?? error)}`);
});

child.on("exit", (code, signal) => {
  clearTimeout(forceTimer);
  try {
    const recorded = Number.parseInt(readFileSync(PID_FILE, "utf8"), 10);
    if (recorded === child.pid) rmSync(PID_FILE, { force: true });
  } catch {
    // The pidfile is already gone.
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
