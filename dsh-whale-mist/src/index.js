import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Themes remain browser-only outside the official Windows desktop Host. */
export function apply(ctx) {
  const executable = process.execPath;
  // Desktop's Host gets ELECTRON_RUN_AS_NODE; DSH_DESKTOP_NODE_EXECUTABLE is
  // only supplied to package-manager children, not to the running Host.
  if (process.platform !== 'win32' || process.env.ELECTRON_RUN_AS_NODE !== '1' ||
      basename(executable).toLowerCase() !== 'deepseek harness.exe' || !process.env.LOCALAPPDATA) return;

  const root = dirname(fileURLToPath(import.meta.url));
  const icon = resolve(root, '../assets/DeepSeek-Harness.ico');
  const helper = resolve(root, '../assets/whale-icon-helper.exe');
  const statusDirectory = join(process.env.LOCALAPPDATA, 'Whale Appearance');
  const child = spawn(helper, [String(process.ppid), executable, icon, statusDirectory], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let disposed = false;
  let output = '';
  child.stdin.on('error', () => {});
  child.on('error', error => console.warn('[Whale desktop icon]', error.message));
  child.stderr.on('data', data => console.warn('[Whale desktop icon]', String(data).trim()));
  child.stdout.on('data', data => {
    output += data;
    let newline;
    while ((newline = output.indexOf('\n')) !== -1) {
      const line = output.slice(0, newline).trim();
      output = output.slice(newline + 1);
      const match = /^applied:(\d+)$/.exec(line);
      if (!match || disposed) continue;
      const status = {
        pid: process.ppid,
        executable,
        icon,
        windowHandle: match[1],
        appUserModelId: 'com.deepseek.dsh',
        verified: true,
        appliedAt: new Date().toISOString(),
      };
      mkdir(statusDirectory, { recursive: true })
        .then(() => writeFile(join(statusDirectory, 'runtime-icon-status.json'), JSON.stringify(status, null, 2)))
        .catch(error => console.warn('[Whale desktop icon]', error.message));
    }
  });
  ctx.on('dispose', () => {
    disposed = true;
    // EOF asks the helper to restore the original window properties and icons.
    child.stdin.end();
  });
}
