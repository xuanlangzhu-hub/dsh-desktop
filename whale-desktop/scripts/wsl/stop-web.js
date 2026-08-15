#!/usr/bin/env node
/**
 * Stop the WSL dsh web backend recorded by start-web.js.
 *
 * The backend runs as its own process-group leader (detached spawn), so the
 * whole Linux dsh/Node tree is terminated with one negative-PID kill. A short
 * grace period is followed by SIGKILL, and the pidfile is only removed after
 * the group is confirmed gone.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

function fail(message) {
  process.stderr.write(`whale-wsl stop-web: ${message}\n`);
  process.exit(1);
}

const HOME = process.env.HOME;
if (!HOME) fail("HOME is not set");
const RUNTIME_ROOT = process.env.WHALE_WSL_RUNTIME || join(HOME, ".local", "share", "whale-harness", "runtime");
const PID_FILE = process.env.WHALE_WSL_PID_FILE || join(RUNTIME_ROOT, "run", "dsh-web.pid");

if (!existsSync(PID_FILE)) {
  process.stdout.write("whale-wsl stop-web: no pidfile — nothing to stop\n");
  process.exit(0);
}

let pid;
try {
  pid = Number.parseInt(readFileSync(PID_FILE, "utf8"), 10);
} catch {
  rmSync(PID_FILE, { force: true });
  process.stdout.write("whale-wsl stop-web: removed unreadable pidfile\n");
  process.exit(0);
}
if (!Number.isInteger(pid) || pid <= 0) {
  rmSync(PID_FILE, { force: true });
  process.stdout.write("whale-wsl stop-web: removed invalid pidfile\n");
  process.exit(0);
}

function groupAlive() {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (!groupAlive()) {
  rmSync(PID_FILE, { force: true });
  process.stdout.write(`whale-wsl stop-web: process group ${pid} already gone\n`);
  process.exit(0);
}

try {
  process.kill(-pid, "SIGTERM");
} catch {
  // Fall through to the wait loop.
}

const deadline = Date.now() + 5000;
while (groupAlive() && Date.now() < deadline) {
  await sleep(150);
}

if (groupAlive()) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Gone between the check and the kill.
  }
  const hardDeadline = Date.now() + 2000;
  while (groupAlive() && Date.now() < hardDeadline) {
    await sleep(100);
  }
}

if (groupAlive()) {
  fail(`process group ${pid} survived SIGKILL; inspect it manually (kill -9 -${pid})`);
}

rmSync(PID_FILE, { force: true });
process.stdout.write(`whale-wsl stop-web: process group ${pid} stopped\n`);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
