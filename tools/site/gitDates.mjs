import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const READERS = 8;

async function commitDate(root, file) {
  try {
    const { stdout } = await run('git', ['log', '-1', '--format=%cs', '--', file], { cwd: root, encoding: 'utf8' });
    const date = stdout.trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}

export async function helpCommitDates(root, files) {
  const dates = new Map();
  const pending = files.values();

  await Promise.all(
    Array.from({ length: Math.min(files.length, READERS) }, async () => {
      for (const file of pending) {
        const date = await commitDate(root, file);

        if (date) dates.set(file, date);
      }
    }),
  );

  return Object.fromEntries(dates);
}

export function completeHelpHistory(root) {
  let shallow;

  try {
    shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return;
  }

  if (shallow === 'true')
    execFileSync('git', ['fetch', '--unshallow', '--no-tags', 'origin'], { cwd: root, stdio: 'inherit' });
}
