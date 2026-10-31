import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);

    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function mergePaths(...lists) {
  const dirs = lists.flatMap((list) => list.split(path.delimiter)).filter(Boolean);

  return Array.from(new Set(dirs)).join(path.delimiter);
}

export function findOnPath(name, pathValue) {
  const dirs = pathValue.split(path.delimiter).filter(Boolean);

  return dirs.map((dir) => path.join(dir, name)).find(isExecutable) ?? null;
}

export async function adoptShellPath({ shell = process.env.SHELL || '/bin/zsh', env = process.env } = {}) {
  const fromShell = await loginShellPath(shell);

  env.PATH = mergePaths(fromShell, env.PATH ?? '', COMMON_DIRS.join(path.delimiter));

  if (!findOnPath('node', env.PATH)) env.BASECASE_NODE = process.execPath;
}
