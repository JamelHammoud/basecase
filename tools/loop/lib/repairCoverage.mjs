import fs from 'node:fs';
import path from 'node:path';
import { run } from './sh.mjs';

const LIST = 'tools/quarantine.json';
const identity = (entry) => JSON.stringify([entry.file, entry.test ?? '', entry.platform]);

export function expandsTestExclusions(cwd) {
  const files = run('git', ['diff', '--name-only', 'origin/main'], { cwd }).out.split(/\r?\n/u);

  if (!files.includes(LIST)) return false;

  const previous = JSON.parse(run('git', ['show', `origin/main:${LIST}`], { cwd }).out);
  const file = path.join(cwd, LIST);
  const next = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const bounds = new Map(previous.map((entry) => [identity(entry), entry.until]));

  return next.some((entry) => !bounds.has(identity(entry)) || entry.until > bounds.get(identity(entry)));
}
