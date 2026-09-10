#!/usr/bin/env node
/**
 * Adapt dsh-reasoning-effort v0.7.0 to DSH 0.1.5's strict client-service
 * injection rules.
 *
 * The upstream client reads modelDirectories during apply and later calls a
 * directory method that now requires the remote.session capability. Under
 * DSH 0.1.5 that either races service registration or throws while rendering,
 * leaving the built-in selector in place. This exact-anchor patch waits for
 * the model directory and grants the narrow session-remote capability.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

export const REASONING_BRIDGE_MARKER = "whale-desktop: dsh-reasoning-effort 0.1.5 bridge v1";
export const SUPPORTED_REASONING_PLUGIN_VERSION = "0.7.0";

const LEGACY_INJECT = 'var inject = ["slots", "modelDirectories", "connection", "locale"];';
const DESKTOP_INJECT = 'var inject = ["slots", "modelDirectories", "connection", "locale", "remote.session"];';
const LEGACY_APPLY = 'function apply(ctx) {\n  const modelDirectories = ctx.get("modelDirectories");';
const DESKTOP_APPLY = 'function applyReady(ctx) {\n  const modelDirectories = ctx.get("modelDirectories");';
const DESKTOP_WRAPPER = 'function apply(ctx) {\n  ctx.inject(["modelDirectories"], (scope) => applyReady(scope));\n}';
const PRE_EXPORT_BOUNDARY = /\n}\n\n(?=[ \t]+return module\.exports;)/g;

function occurrences(content, needle) {
  return content.split(needle).length - 1;
}

export function patchReasoningClient(content, targetLabel = "dsh-reasoning-effort/lib/client/index.js") {
  const legacyCounts = [LEGACY_INJECT, LEGACY_APPLY].map((needle) => occurrences(content, needle));
  const desktopCounts = [DESKTOP_INJECT, DESKTOP_APPLY, DESKTOP_WRAPPER].map((needle) => occurrences(content, needle));
  if (content.includes(REASONING_BRIDGE_MARKER)) {
    if (legacyCounts.some((count) => count !== 0) || desktopCounts.some((count) => count !== 1)) {
      throw new Error(`corrupt ${REASONING_BRIDGE_MARKER} state in ${targetLabel}`);
    }
    return { changed: false, content };
  }
  const exportBoundaries = [...content.matchAll(PRE_EXPORT_BOUNDARY)].length;
  if (legacyCounts.some((count) => count !== 1) || desktopCounts.some((count) => count !== 0) || exportBoundaries !== 1) {
    throw new Error(
      `unsupported dsh-reasoning-effort client shape in ${targetLabel}: expected one copy of each v0.7.0 anchor, found ${legacyCounts.join("/")} with ${exportBoundaries} export boundary`,
    );
  }
  const patched = content
    .replace(LEGACY_INJECT, DESKTOP_INJECT)
    .replace(LEGACY_APPLY, DESKTOP_APPLY)
    .replace(PRE_EXPORT_BOUNDARY, `\n}\n\n${DESKTOP_WRAPPER}\n\n`);
  return {
    changed: true,
    content: `/* ${REASONING_BRIDGE_MARKER} */\n${patched}`,
  };
}

export function patchReasoningProfile(profileDir) {
  const packageDir = join(resolve(profileDir), "node_modules", "dsh-reasoning-effort");
  const manifestPath = join(packageDir, "package.json");
  const target = join(packageDir, "lib", "client", "index.js");
  if (!existsSync(manifestPath) || !existsSync(target)) return { status: "missing", target };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== SUPPORTED_REASONING_PLUGIN_VERSION) {
    throw new Error(
      `unsupported dsh-reasoning-effort version ${String(manifest.version)}; expected ${SUPPORTED_REASONING_PLUGIN_VERSION}`,
    );
  }
  const plan = patchReasoningClient(readFileSync(target, "utf8"), target);
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
    const result = patchReasoningProfile(parseProfileDir(process.argv.slice(2)));
    process.stdout.write(`reasoning effort 0.1.5 bridge: ${result.status} ${result.target}\n`);
  } catch (error) {
    process.stderr.write(`reasoning effort 0.1.5 bridge: ${String(error.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
