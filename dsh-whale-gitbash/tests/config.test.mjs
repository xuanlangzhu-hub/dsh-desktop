import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { isGitBash, resolveGitBash, toWindowsPath } from '../src/executor-core.js';

test('MSYS drive paths convert without turning /usr into a drive', () => {
  assert.equal(toWindowsPath('/f/中文 工作区'), 'F:\\中文 工作区');
  assert.equal(toWindowsPath('/f'), 'F:\\');
  assert.equal(toWindowsPath('/usr/bin'), '/usr/bin');
  assert.equal(toWindowsPath('F:/native'), 'F:/native');
});

test('System32 WSL launcher is rejected; Git cmd sibling is discovered', () => {
  const bash = 'F:\\Git\\bin\\bash.exe';
  const files = new Set([bash, join(dirname(bash), '..', 'usr', 'bin', 'msys-2.0.dll'), 'C:\\Windows\\System32\\bash.exe']);
  const exists = path => files.has(path);
  assert.equal(isGitBash('C:\\Windows\\System32\\bash.exe', exists), false);
  assert.equal(resolveGitBash(undefined, { PATH: 'C:\\Windows\\System32;F:\\Git\\cmd' }, exists), bash);
  assert.throws(() => resolveGitBash('C:\\Windows\\System32\\bash.exe', {}, exists), /Not a Git/);
});
