import { run } from './sh.mjs';

const PROTECTED_PATHS = [
  '.github/',
  'tools/release/',
  'electron/updates.mjs',
  'electron/updateState.mjs',
  'electron/cad-kernel/sandbox/',
  'verify/',
  'hw/',
];
const PROTECTED_NAMES = /\b(guardBridge|trustedIpc|checkedFileId|publicFetch)\b/;
const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;

export function changedLines(diff) {
  const files = new Map();
  let current = null;

  for (const line of diff.split('\n')) {
    const header = FILE_HEADER.exec(line);

    if (header) {
      current = header[2];
      files.set(current, []);

      continue;
    }

    const isChange = /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line);

    if (current && isChange) files.get(current).push(line.slice(1));
  }

  return files;
}

const isProtected = (file, lines) =>
  PROTECTED_PATHS.some((prefix) => file.startsWith(prefix)) || lines.some((line) => PROTECTED_NAMES.test(line));

export const protectedFiles = (diff) =>
  [...changedLines(diff)].filter(([file, lines]) => isProtected(file, lines)).map(([file]) => file);

export const protectedIn = (range, dir) => protectedFiles(run('git', ['diff', '--unified=0', range], { cwd: dir }).out);

export const protectedList = (files) => files.map((file) => `\`${file}\``).join(', ');
