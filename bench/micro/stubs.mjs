import fs from 'node:fs';
import path from 'node:path';

export const TASK_FILE = 'task.json';

export function writeStub(dir, task, start = null) {
  fs.mkdirSync(dir, { recursive: true });

  if (start) fs.writeFileSync(path.join(dir, 'start.json'), JSON.stringify(start));

  fs.writeFileSync(path.join(dir, TASK_FILE), `${JSON.stringify(task, null, 2)}\n`);
}

export function readStubs(root) {
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((dir) => fs.existsSync(path.join(dir, TASK_FILE)))
    .map((dir) => ({ dir, stub: JSON.parse(fs.readFileSync(path.join(dir, TASK_FILE), 'utf8')) }));
}
