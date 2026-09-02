#!/usr/bin/env node
/**
 * Build or refresh the WSL backend's independent dsh profile
 * (~/.dsh/profiles/whale-desktop-wsl) from the Windows profile's plugin
 * manifest and lockfile.
 *
 * Rules:
 *   - In-box bundles (@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app) are
 *     never declared as profile dependencies; they resolve from the WSL dsh
 *     installation at boot.
 *   - Whale Appearance is re-pointed at the managed theme copy inside the WSL
 *     runtime directory (a fresh copy of source, not the Windows link).
 *   - Every other Windows plugin is re-pinned to the exact resolved tarball
 *     URL recorded in the Windows profile's pnpm-lock.yaml and installed by
 *     pnpm in WSL. No Windows node_modules or symlinks are copied.
 *   - Existing unknown fields/dependencies in the WSL profile are preserved,
 *     so re-running preparation never destroys local additions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

function fail(message) {
  process.stderr.write(`whale-wsl profile: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { profileDir: undefined, sourceProfileDir: undefined, runtimeRoot: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (value === undefined) fail(`argument ${argument} needs a value`);
    if (argument === "--profile-dir") options.profileDir = value;
    else if (argument === "--source-profile-dir") options.sourceProfileDir = value;
    else if (argument === "--runtime-root") options.runtimeRoot = value;
    else fail(`unknown argument: ${argument}`);
    index += 1;
  }
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) fail(`missing required argument: ${key}`);
  }
  return options;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${label} ${path}: ${String(error.message ?? error)}`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");
}

const options = parseArgs(process.argv.slice(2));
const profileDir = options.profileDir;
const sourceProfileDir = options.sourceProfileDir;
const themeDir = join(options.runtimeRoot, "theme", "dsh-whale-mist");

const sourceManifest = readJson(join(sourceProfileDir, "package.json"), "source profile manifest");
const sourceLockPath = join(sourceProfileDir, "pnpm-lock.yaml");
if (!existsSync(sourceLockPath)) fail(`source profile lockfile not found: ${sourceLockPath}`);

const require = createRequire(join(options.runtimeRoot, "dsh", "package.json"));
let yaml;
try {
  yaml = require("js-yaml");
} catch {
  fail(`js-yaml is not installed in the WSL runtime; run the runtime npm ci step first`);
}
let sourceLock;
try {
  sourceLock = yaml.load(readFileSync(sourceLockPath, "utf8"));
} catch (error) {
  fail(`cannot parse source profile lockfile ${sourceLockPath}: ${String(error.message ?? error)}`);
}

const sourceDependencies = sourceManifest.dependencies ?? {};
const sourceImporter = sourceLock?.importers?.["."]?.dependencies ?? {};
const sourceBundles = Array.isArray(sourceManifest.dsh?.profile?.bundles) ? sourceManifest.dsh.profile.bundles : [];

/** Re-pin one Windows profile dependency for WSL. */
const pinnedDependencies = {};
for (const [packageName, specifier] of Object.entries(sourceDependencies)) {
  if (packageName === "dsh-whale-mist") {
    if (!existsSync(join(themeDir, "package.json"))) {
      fail(`managed Whale Appearance copy is missing: ${themeDir}`);
    }
    pinnedDependencies[packageName] = `link:${themeDir}`;
    continue;
  }
  const resolution = sourceImporter[packageName]?.version;
  if (typeof resolution === "string" && resolution.startsWith("link:")) {
    fail(`plugin ${packageName} is installed as a Windows link (${resolution}); refusing to copy the link — reinstall it from its published source`);
  }
  pinnedDependencies[packageName] = typeof resolution === "string" && resolution.length > 0
    ? resolution
    : String(specifier);
}

mkdirSync(profileDir, { recursive: true });
const manifestPath = join(profileDir, "package.json");
const existingManifest = existsSync(manifestPath) ? readJson(manifestPath, "WSL profile manifest") : {};

/** Preserve user-installed WSL-only dependencies, refresh managed ones. */
const existingDependencies = existingManifest.dependencies && typeof existingManifest.dependencies === "object"
  ? existingManifest.dependencies
  : {};
const dependencies = { ...existingDependencies, ...pinnedDependencies };

const managedPlugins = Object.keys(pinnedDependencies).filter((packageName) => sourceBundles.includes(packageName));
const requiredBundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"];
const bundles = [
  ...requiredBundles,
  ...managedPlugins,
  ...(Array.isArray(existingManifest.dsh?.profile?.bundles) ? existingManifest.dsh.profile.bundles : [])
    .filter((bundle) => !requiredBundles.includes(bundle) && !managedPlugins.includes(bundle)),
];

const manifest = {
  ...existingManifest,
  name: existingManifest.name ?? `dsh-profile-${basename(profileDir)}`,
  private: true,
  dependencies,
  dsh: {
    ...(existingManifest.dsh ?? {}),
    profile: {
      ...(existingManifest.dsh?.profile ?? {}),
      bundles,
    },
  },
};
writeJson(manifestPath, manifest);

const patchPath = join(profileDir, "cordis.patch.yml");
if (!existsSync(patchPath)) {
  writeFileSync(patchPath, "# Whale Desktop WSL user overrides. This file is preserved across updates.\n[]\n", "utf8");
}

const workspacePath = join(profileDir, "pnpm-workspace.yaml");
const managedWorkspaceMarker = "# whale-harness-managed";
const buildDependencies = Object.entries(pinnedDependencies)
  .filter(([, specifier]) => /^(https?:|git\+|github:)/.test(String(specifier)))
  .map(([packageName]) => packageName);
const workspaceContent = [
  `${managedWorkspaceMarker} pnpm settings for the WSL backend profile`,
  "packages:",
  "  - .",
  "",
  "nodeLinker: hoisted",
  "autoInstallPeers: false",
  "",
  ...(buildDependencies.length > 0
    ? ["onlyBuiltDependencies:", ...buildDependencies.map((name) => `  - ${name}`), ""]
    : []),
].join("\n");
if (!existsSync(workspacePath)) {
  writeFileSync(workspacePath, workspaceContent, "utf8");
} else {
  const existingWorkspace = readFileSync(workspacePath, "utf8");
  if (existingWorkspace.includes(managedWorkspaceMarker)) {
    writeFileSync(workspacePath, workspaceContent, "utf8");
  }
}

process.stdout.write(`whale-wsl profile ready at ${profileDir}\n`);
process.stdout.write(`dependencies: ${Object.keys(dependencies).join(", ") || "(none)"}\n`);
process.stdout.write(`bundles: ${bundles.join(", ")}\n`);
