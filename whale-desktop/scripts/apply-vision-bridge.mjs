#!/usr/bin/env node
/**
 * vision-bridge v2 — cross-platform patch entry for DeepSeek Harness rc.6.
 *
 * Patches exactly two upstream packages in a materialized node_modules tree:
 *   - @deepseek-ai/dsh-host-apiproxy/lib/index.js
 *       relax the image admission gates so image blocks flow into the session
 *       for client previews while the deepseek adapter bridges them to text.
 *   - @deepseek-ai/dsh-llm-deepseek/lib/index.js
 *       replace assertTextOnly with bridgeImageBlocks and route the wire
 *       serialization loop through it.
 *
 * Idempotent: already-patched files are skipped unchanged. Upstream marker
 * drift makes the run fail WITHOUT touching any file. Every changed file must
 * pass `node --check` (the Node binary running this script).
 *
 * Usage:
 *   node apply-vision-bridge.mjs --modules-root <path-to-node_modules>
 */

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const V2_MARKER = "[vision-bridge-v2]";

const PROMPT_GATE_MARKER = "[vision-bridge-v2] image admission relaxed";
const PROMPT_GATE_REPLACEMENT = "// [vision-bridge-v2] image admission relaxed: image blocks flow into the session for client previews; the deepseek adapter bridges them to text notes at serialization time.";
const PROMPT_GATE_PATTERN = /if \(modelInfo\.inputModalities !== void 0 && !modelInfo\.inputModalities\.includes\("image"\)\) return err\(request, \{[\s\S]*?details: \{ reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" \}\s*\}\);/;

const SELECT_GATE_MARKER = "[vision-bridge-v2] relaxed model-switch guard";
const SELECT_GATE_REPLACEMENT = "// [vision-bridge-v2] relaxed model-switch guard: sessions may keep image blocks; the deepseek adapter bridges them to text notes.";
const SELECT_GATE_PATTERN = /if \(\[\.\.\.found\.agent\.inbox\.nextTurn[\s\S]*?select an image-capable model\.`[\s\S]*?\);\r?\n\s*\}/;

const ADAPTER_FUNCTION_MARKER = "[vision-bridge-v2] Bridge image blocks";
const ADAPTER_FUNCTION_REPLACEMENT = [
  "/** [vision-bridge-v2] Bridge image blocks into text references (this wire route is text-only). */",
  "function bridgeImageBlocks(blocks) {",
  "\tif (!contentHasImage(blocks)) return blocks;",
  "\tconst home = process.env.DSH_HOME ?? (process.env.USERPROFILE ?? process.env.HOME ?? \"\") + \"/.dsh\";",
  "\treturn blocks.map((block) => {",
  "\t\tif (block.type !== \"image\") return block;",
  "\t\tconst ref = block.attachment ?? {};",
  "\t\tconst id = typeof ref.attachmentId === \"string\" ? ref.attachmentId : \"unknown\";",
  "\t\tconst sha = id.startsWith(\"sha256:\") ? id.slice(7) : \"\";",
  "\t\tconst file = sha.length === 64 ? `${home}/attachments/v1/objects/${sha.slice(0, 2)}/${sha}` : \"\";",
  "\t\tconst name = typeof ref.name === \"string\" && ref.name !== \"\" ? ref.name : \"\";",
  "\t\tlet note = `[用户发送了一张图片（attachmentId: ${id}`;",
  "\t\tif (name !== \"\") note += `，文件名: ${name}`;",
  "\t\tif (file !== \"\") note += `，本地文件: ${file}`;",
  "\t\tnote += \"）。当前模型不支持直接查看图片，如需看图请使用 claude-vision-skill（vision.js）识图后再回复。]\";",
  "\t\treturn { type: \"text\", text: note };",
  "\t});",
  "}",
].join("\n");
const ADAPTER_FUNCTION_PATTERN = /function assertTextOnly\(blocks\) \{\s*if \(contentHasImage\(blocks\)\) throw new LlmError\("The DeepSeek chat-completions adapter does not support image content\."\s*,\s*"UNSUPPORTED_CONTENT"\);\s*\}/;

const ADAPTER_LOOP_MARKER = "[vision-bridge-v2] serialize image blocks through text bridge";
const ADAPTER_LOOP_REPLACEMENT = [
  "\tfor (const message of messages) {",
  "\t\t// [vision-bridge-v2] serialize image blocks through text bridge.",
  "\t\tconst content = bridgeImageBlocks(message.content);",
  "\t\tif (message.role === \"system\") {",
  "\t\t\twire.push({",
  "\t\t\t\trole: \"system\",",
  "\t\t\t\tcontent: flattenText(content)",
  "\t\t\t});",
  "\t\t\tcontinue;",
  "\t\t}",
  "\t\tif (message.role === \"assistant\") {",
  "\t\t\twire.push(serializeAssistant({",
  "\t\t\t\t...message,",
  "\t\t\t\tcontent",
  "\t\t\t}));",
  "\t\t\tcontinue;",
  "\t\t}",
  "\t\tconst toolResults = content.filter((block) => block.type === \"tool-result\");",
  "\t\tconst text = flattenText(content);",
].join("\n");
const ADAPTER_LOOP_PATTERN = /for \(const message of messages\) \{\s*assertTextOnly\(message\.content\);\s*if \(message\.role === "system"\) \{\s*wire\.push\(\{\s*role: "system",\s*content: flattenText\(message\.content\)\s*\}\);\s*continue;\s*\}\s*if \(message\.role === "assistant"\) \{\s*wire\.push\(serializeAssistant\(message\)\);\s*continue;\s*\}\s*const toolResults = message\.content\.filter\(\(block\) => block\.type === "tool-result"\);\s*const text = flattenText\(message\.content\);/;

function replaceExactlyOnce(content, pattern, replacement, label) {
  const matches = content.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  const count = matches === null ? 0 : matches.length;
  if (count !== 1) {
    throw new Error(`vision-bridge v2 marker not found or ambiguous for ${label} (matches: ${count})`);
  }
  return content.replace(pattern, () => replacement);
}

function planApiProxyPatch(path, content) {
  const hasPromptMarker = content.includes(PROMPT_GATE_MARKER);
  const hasSelectMarker = content.includes(SELECT_GATE_MARKER);
  if (hasPromptMarker && hasSelectMarker) {
    return { path, content, changed: false };
  }
  if (content.includes(V2_MARKER)) {
    throw new Error(`vision-bridge v2 partial marker set in ${path}`);
  }
  let patched = replaceExactlyOnce(content, PROMPT_GATE_PATTERN, PROMPT_GATE_REPLACEMENT, "dsh-host-apiproxy session.prompt gate");
  patched = replaceExactlyOnce(patched, SELECT_GATE_PATTERN, SELECT_GATE_REPLACEMENT, "dsh-host-apiproxy session.selectModel gate");
  return { path, content: patched, changed: true };
}

function planDeepSeekPatch(path, content) {
  const hasFunctionMarker = content.includes(ADAPTER_FUNCTION_MARKER);
  const hasLoopBridge = content.includes("const content = bridgeImageBlocks(message.content);");
  if (hasFunctionMarker && hasLoopBridge) {
    return { path, content, changed: false };
  }
  if (content.includes(V2_MARKER) || content.includes(ADAPTER_LOOP_MARKER)) {
    throw new Error(`vision-bridge v2 partial marker set in ${path}`);
  }
  let patched = replaceExactlyOnce(content, ADAPTER_FUNCTION_PATTERN, ADAPTER_FUNCTION_REPLACEMENT, "dsh-llm-deepseek assertTextOnly");
  patched = replaceExactlyOnce(patched, ADAPTER_LOOP_PATTERN, ADAPTER_LOOP_REPLACEMENT, "dsh-llm-deepseek serializeMessages loop");
  return { path, content: patched, changed: true };
}

function writeAtomicUtf8(path, content) {
  const temporaryPath = `${path}.vision-bridge-v2.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, content, "utf8");
    try {
      renameSync(temporaryPath, path);
    } catch (error) {
      if (!["EEXIST", "EPERM"].includes(error.code)) throw error;
      rmSync(path, { force: true });
      renameSync(temporaryPath, path);
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function collectIndexFiles(root) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      throw new Error(`vision-bridge v2 cannot read ${dir}: ${String(error)}`);
    }
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name === "index.js") files.push(path);
    }
  };
  walk(root);
  return files;
}

function resolveDefaultModulesRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "runtime", "dsh", "node_modules");
}

function parseArgs(argv) {
  let modulesRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--modules-root") {
      const value = argv[index + 1];
      if (value === undefined || value === "") {
        throw new Error("--modules-root needs a path");
      }
      modulesRoot = resolve(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      throw new Error("usage: node apply-vision-bridge.mjs --modules-root <node_modules>");
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return modulesRoot ?? resolveDefaultModulesRoot();
}

function syntaxCheck(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`node --check failed for ${path}:\n${result.stderr ?? result.stdout ?? ""}`.trimEnd());
  }
}

function main() {
  let modulesRoot;
  try {
    modulesRoot = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`vision-bridge v2: ${String(error.message ?? error)}\n`);
    process.exitCode = 2;
    return;
  }
  if (!existsSync(modulesRoot)) {
    process.stderr.write(`vision-bridge v2: node_modules root not found: ${modulesRoot}\n`);
    process.exitCode = 1;
    return;
  }

  const packageSpecs = [
    { name: "dsh-host-apiproxy", planner: planApiProxyPatch },
    { name: "dsh-llm-deepseek", planner: planDeepSeekPatch },
  ];

  const packageSuffix = (packageName) => sep + ["@deepseek-ai", packageName, "lib", "index.js"].join(sep);

  try {
    const knownSuffixes = new Set(packageSpecs.map((spec) => packageSuffix(spec.name)));
    const indexFiles = collectIndexFiles(modulesRoot).filter((file) => [...knownSuffixes].some((suffix) => file.endsWith(suffix)));
    const plans = [];
    for (const spec of packageSpecs) {
      const suffix = packageSuffix(spec.name);
      const targets = indexFiles.filter((file) => file.endsWith(suffix));
      if (targets.length === 0) {
        throw new Error(`vision-bridge v2 target package not found: ${spec.name} under ${modulesRoot}`);
      }
      for (const target of targets) {
        const content = readFileSync(target, "utf8");
        plans.push(spec.planner(target, content));
      }
    }

    for (const plan of plans) {
      if (plan.changed) {
        writeAtomicUtf8(plan.path, plan.content);
        process.stdout.write(`PATCHED ${plan.path}\n`);
      } else {
        process.stdout.write(`SKIP already patched ${plan.path}\n`);
      }
    }

    for (const plan of plans) {
      syntaxCheck(plan.path);
    }

    const changedCount = plans.filter((plan) => plan.changed).length;
    process.stdout.write(`vision-bridge v2 ready (${changedCount} changed, ${plans.length - changedCount} unchanged).\n`);
  } catch (error) {
    process.stderr.write(`vision-bridge v2: ${String(error.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

main();
