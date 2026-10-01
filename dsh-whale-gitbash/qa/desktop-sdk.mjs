/** Run with the installed official Electron executable in ELECTRON_RUN_AS_NODE mode. */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGitBashExecutor } from '../src/executor-core.js';

const resources = join(dirname(process.execPath), 'resources');
const require = createRequire(join(resources, 'app.asar/dsh/package.json'));
const { Context } = require('@deepseek-ai/cordis');
const z = require('@deepseek-ai/schemastery');
const Subprocess = require('@deepseek-ai/dsh-subprocess-local').default;
const Sandbox = require('@deepseek-ai/dsh-sandbox-local').default;
const Base = require('@deepseek-ai/dsh-pwsh-sandbox').default;
const Executor = createGitBashExecutor(Base, z);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = join(repo, '.tmp');
mkdirSync(scratch, { recursive: true });
const testRoot = mkdtempSync(join(scratch, 'gitbash-native-'));
const workspace = join(testRoot, '中文 工作区');
mkdirSync(workspace);
const outside = join(testRoot, 'outside.txt');
writeFileSync(outside, 'unchanged');
const get = value => ({ get: () => value });
const ctx = new Context();
let executor;
const qaFiber = ctx.plugin({
  name: 'whale-gitbash-native-qa',
  apply(child) {
    new Subprocess(child);
    new Sandbox(child, { runnerCommand: [], runnerFailureSignatures: [], probeTimeoutMs: 5000 });
    child.provide('sandboxPolicy', {
      defaultMode: 'workspace-write',
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }),
    });
    executor = new Executor(child, {
      shellPath: get(undefined), cwd: get(workspace), timeoutMs: get(10000),
      maxTimeoutMs: get(20000), maxOutputBytes: get(64000),
      maxSpillBytes: get(1024 * 1024), graceMs: get(1000),
    });
  },
});
for (let i = 0; !executor && i < 20; i++) await new Promise(resolve => setImmediate(resolve));
if (!executor) throw new Error('Cordis did not initialize the QA provider.');

const results = [];
async function run(mode, command, extra = {}) {
  const spec = executor.resolve({ command, workdir: workspace, sandboxPolicy: { mode, workspaceRoot: workspace }, ...extra });
  const process = await executor.execute(spec);
  const result = await process.result();
  return { process, result };
}
try {
  for (const mode of ['workspace-write', 'read-only', 'danger-full-access']) {
    try {
      const { result } = await run(mode, "printf '中文输出✓\\n'; pwd; command -v node; git --version");
      results.push({ mode, exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text, sandbox: result.sandbox });
      if (result.exitCode === 0) assert.match(result.stdout.text, /中文输出✓/);
    } catch (error) { results.push({ mode, error: error.message }); }
  }
  const { result: write } = await run('danger-full-access', "printf 'fixture' > inside.txt");
  assert.equal(write.exitCode, 0);
  assert.equal(readFileSync(join(workspace, 'inside.txt'), 'utf8'), 'fixture');
  results.push({ test: 'approved-fixture-write', exitCode: write.exitCode });
  const outsideBash = outside.replaceAll('\\', '/');
  await assert.rejects(run('workspace-write', `printf 'changed' > '${outsideBash}'`), /No command was started/);
  assert.equal(readFileSync(outside, 'utf8'), 'unchanged', 'Sandbox allowed a write outside the fixture workspace');
  results.push({ test: 'confined-call-refused-without-escalation', passed: true });
  const { result: exit } = await run('danger-full-access', 'exit 7');
  assert.equal(exit.exitCode, 7);
  const { result: node } = await run('danger-full-access', "node -p 'process.cwd()'");
  assert.equal(node.exitCode, 0);
  assert.equal(node.stdout.text.trim(), workspace);
  results.push({ test: 'native-node-in-chinese-space-path', passed: true });
  const background = await executor.execute(executor.resolve({
    command: "sleep 0.5; printf 'background complete'", workdir: workspace,
    onExpiry: 'none', sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: workspace },
  }));
  assert.equal(background.status, 'running');
  await background.done;
  assert.match(background.readOutput().delta, /background complete/);
  assert.equal(background.readOutput().delta, '');
  results.push({ test: 'exit-code-and-background-handles', passed: true });
  const { result: timeout } = await run('danger-full-access', 'sleep 3', { timeoutMs: 300 });
  assert.equal(timeout.timedOut, true);
  assert.equal(timeout.aborted, false);
  results.push({ test: 'timeout-and-managed-termination', passed: true });
} finally {
  console.log(JSON.stringify({ host: process.execPath, shell: executor.pwshPath, testRoot, results }, null, 2));
  await qaFiber.dispose();
}
