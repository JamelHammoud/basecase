import fs from 'node:fs';
import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';

export const exeName = (name, platform = process.platform) => (platform === 'win32' ? `${name}.exe` : name);

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);

    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function findOnPath(name, pathValue = process.env.PATH ?? '', platform = process.platform) {
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const file = exeName(name, platform);

  return dirs.map((dir) => path.join(dir, file)).find(isExecutable) ?? null;
}

const QUOTED = /"([^"]*)"|'([^']*)'|(\S+)/g;

export function splitCommand(command) {
  return Array.from(String(command).trim().matchAll(QUOTED), (m) => m[1] ?? m[2] ?? m[3]);
}
