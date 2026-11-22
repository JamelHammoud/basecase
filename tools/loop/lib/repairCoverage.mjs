import fs from 'node:fs';
import path from 'node:path';
import { run } from './sh.mjs';

const LIST = 'tools/quarantine.json';
const identity = (entry) => JSON.stringify([entry.file, entry.test ?? '', entry.platform ?? '']);

const readNext = (file) => {
  if (!fs.existsSync(file)) return [];

  try {
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'));

    return Array.isArray(entries) ? entries : null;
  } catch {
    return null;
  }
};

export function expandsTestExclusions(cwd) {
  const base = run('git', ['merge-base', 'HEAD', 'origin/main'], { cwd }).out;
  const files = run('git', ['diff', '--name-only', base], { cwd }).out.split(/\r?\n/u);

  if (!files.includes(LIST)) return false;

  const previous = JSON.parse(run('git', ['show', `${base}:${LIST}`], { cwd }).out);
  const next = readNext(path.join(cwd, LIST));

  if (!next) return true;

  const bounds = new Map(previous.map((entry) => [identity(entry), entry.until]));

  return next.some((entry) => !bounds.has(identity(entry)) || entry.until > bounds.get(identity(entry)));
}
