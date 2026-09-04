#!/usr/bin/env node
/**
 * Apply Whale Desktop's narrow focus compatibility patch to dsh-notification.
 *
 * The upstream plugin deliberately uses Page Visibility for browsers. A Tauri
 * window can lose focus while its single WebView remains `visible`, so the
 * current-session completion is otherwise suppressed. The exact-anchor patch
 * fails closed when upstream changes instead of silently shipping stale logic.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export const FOCUS_PATCH_MARKER = "whale-desktop: notification focus bridge v1";
const LEGACY_ARGUMENT = "document.hidden, id, state.current";
const DESKTOP_ARGUMENT = "document.hidden || !document.hasFocus(), id, state.current";
const EXPECTED_CALLS = 2;

function occurrences(content, needle) {
  return content.split(needle).length - 1;
}

export function patchNotificationClient(content, targetLabel = "dsh-notification/lib/client.js") {
  const legacyCount = occurrences(content, LEGACY_ARGUMENT);
  const desktopCount = occurrences(content, DESKTOP_ARGUMENT);
  if (content.includes(FOCUS_PATCH_MARKER)) {
    if (legacyCount !== 0 || desktopCount !== EXPECTED_CALLS) {
      throw new Error(`corrupt ${FOCUS_PATCH_MARKER} state in ${targetLabel}`);
    }
    return { changed: false, content };
  }
  if (legacyCount !== EXPECTED_CALLS || desktopCount !== 0) {
    throw new Error(
      `unsupported dsh-notification client shape in ${targetLabel}: expected ${EXPECTED_CALLS} visibility gates, found ${legacyCount}`,
    );
  }
  return {
    changed: true,
    content: `/* ${FOCUS_PATCH_MARKER} */\n${content.replaceAll(LEGACY_ARGUMENT, DESKTOP_ARGUMENT)}`,
  };
}

export function patchNotificationProfile(profileDir) {
  const target = join(resolve(profileDir), "node_modules", "dsh-notification", "lib", "client.js");
  if (!existsSync(target)) return { status: "missing", target };
  const plan = patchNotificationClient(readFileSync(target, "utf8"), target);
  if (!plan.changed) return { status: "unchanged", target };
  const temporary = `${target}.whale-desktop.tmp`;
  try {
    writeFileSync(temporary, plan.content, "utf8");
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return { status: "patched", target };
}

function parseProfileDir(argv) {
  const index = argv.indexOf("--profile-dir");
  if (index === -1 || !argv[index + 1]) throw new Error("missing --profile-dir <path>");
  return argv[index + 1];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = patchNotificationProfile(parseProfileDir(process.argv.slice(2)));
    process.stdout.write(`notification focus bridge: ${result.status} ${result.target}\n`);
  } catch (error) {
    process.stderr.write(`notification focus bridge: ${String(error.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
