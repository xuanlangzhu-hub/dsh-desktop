import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function toWindowsPath(value) {
  const match = /^\/([a-z])(?:\/(.*))?$/i.exec(value);
  return match ? `${match[1].toUpperCase()}:\\${(match[2] ?? '').replaceAll('/', '\\')}` : value;
}

/** Exclude Windows' System32 bash.exe (the WSL launcher), even on PATH. */
export function isGitBash(file, exists = existsSync) {
  if (!file || !exists(file)) return false;
  const directory = dirname(file);
  return exists(join(directory, 'msys-2.0.dll')) ||
    exists(join(directory, '..', 'usr', 'bin', 'msys-2.0.dll'));
}

export function resolveGitBash(explicit, env = process.env, exists = existsSync) {
  if (explicit) {
    const path = resolve(toWindowsPath(explicit));
    if (!isGitBash(path, exists)) throw new Error(`Not a Git for Windows Bash executable: ${path}`);
    return path;
  }
  const candidates = [env.GIT_BASH];
  for (const root of [env.ProgramFiles, env['ProgramFiles(x86)']]) {
    if (root) candidates.push(join(root, 'Git', 'bin', 'bash.exe'));
  }
  if (env.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'));
  for (const directory of (env.PATH ?? '').split(';').filter(Boolean)) {
    candidates.push(join(directory, 'bash.exe'), join(directory, '..', 'bin', 'bash.exe'));
  }
  const found = candidates.find(path => isGitBash(path, exists));
  if (!found) throw new Error('Git Bash was not found. Configure shellPath with the Git for Windows bash.exe path.');
  return resolve(found);
}

/** Retain the official Windows confinement, process handles, jobs and deadlines. */
export function createGitBashExecutor(SandboxPwshExecutor, z) {
  return class GitBashExecutor extends SandboxPwshExecutor {
    static Config = z.object({
      shellPath: z.string().volatile(),
      cwd: z.string().volatile(),
      timeoutMs: z.number().default(120000).volatile(),
      maxTimeoutMs: z.number().default(600000).volatile(),
      maxOutputBytes: z.number().default(64000).volatile(),
      maxSpillBytes: z.number().default(64 * 1024 * 1024).volatile(),
      graceMs: z.number().default(3000).volatile(),
    });

    constructor(ctx, config) {
      if (process.platform !== 'win32') throw new Error('This preset requires Git for Windows.');
      // The inherited discovery seam accepts an explicit executable; argv below
      // supplies Bash arguments, so no PowerShell process is used for commands.
      super(ctx, {
        ...config,
        pwshPath: { get: () => resolveGitBash(config.shellPath.get()) },
      });
    }

    argv(spec) {
      return [this.pwshPath, '--noprofile', '--norc', '-c', spec.command];
    }

    async execute(spec) {
      const mode = spec.sandboxPolicy?.mode ?? this.sandboxMode;
      if (mode !== 'danger-full-access') {
        const error = new Error(`Git Bash cannot initialize its MSYS signal pipe under the Windows ${mode} restricted-token sandbox. Keep PowerShell for confined commands, or obtain explicit approval for this exact command using sandbox_permissions: danger-full-access. No command was started and no permission mode was changed.`);
        error.name = 'GitBashConfinementError';
        throw error;
      }
      return super.execute(spec);
    }

    resolve(request) {
      return super.resolve({
        ...request,
        ...(request.workdir ? { workdir: toWindowsPath(request.workdir) } : {}),
        env: { TERM: 'dumb', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...request.env },
      });
    }
  };
}
