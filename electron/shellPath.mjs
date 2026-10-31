import { execFile } from 'node:child_process';
import path from 'node:path';
import { findOnPath } from './executables.mjs';

const MARK = '__BASECASE_PATH__';
const SHELL_TIMEOUT_MS = 5000;
const COMMON_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

function loginShellPath(shell) {
  return new Promise((resolve) => {
    execFile(
      shell,
      ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`],
      { timeout: SHELL_TIMEOUT_MS, encoding: 'utf8' },
      (_err, stdout) => resolve(new RegExp(`${MARK}(.*?)${MARK}`, 's').exec(stdout ?? '')?.[1] ?? ''),
    );
  });
}

export function mergePaths(...lists) {
  const dirs = lists.flatMap((list) => list.split(path.delimiter)).filter(Boolean);

  return Array.from(new Set(dirs)).join(path.delimiter);
}

export async function adoptShellPath({
  shell = process.env.SHELL || '/bin/zsh',
  env = process.env,
  platform = process.platform,
} = {}) {
  if (platform !== 'win32') {
    const fromShell = await loginShellPath(shell);

    env.PATH = mergePaths(fromShell, env.PATH ?? '', COMMON_DIRS.join(path.delimiter));
  }

  if (!findOnPath('node', env.PATH ?? '', platform)) env.BASECASE_NODE = process.execPath;
}
