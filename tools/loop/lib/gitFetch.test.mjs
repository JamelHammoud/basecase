import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { run } from './sh.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-git-fetch-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);

const { fetchGit } = await import('./gitFetch.mjs');
const source = new URL('./gitFetch.mjs', import.meta.url).href;
const shell = new URL('./sh.mjs', import.meta.url).href;
const git = (cwd, args) => run('git', args, { cwd }).out;
const remote = path.join(directory, 'remote');
const checkout = path.join(directory, 'checkout');

fs.mkdirSync(remote);
git(remote, ['init', '-q', '-b', 'main']);
git(remote, ['config', 'user.name', 'test']);
git(remote, ['config', 'user.email', 'test@example.com']);
fs.writeFileSync(path.join(remote, 'source.txt'), 'before\n');
git(remote, ['add', '.']);
git(remote, ['commit', '-qm', 'initial']);
git(directory, ['clone', '-q', remote, checkout]);

const worktrees = [checkout, path.join(directory, 'one'), path.join(directory, 'two')];

for (const dir of worktrees.slice(1)) git(checkout, ['worktree', 'add', '-qb', path.basename(dir), dir]);

fs.writeFileSync(path.join(remote, 'source.txt'), 'after\n');
git(remote, ['commit', '-qam', 'update']);

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function fetchInChild(cwd, events) {
  const script = `
    import fs from 'node:fs';
    import { fetchGit } from ${JSON.stringify(source)};
    import { run } from ${JSON.stringify(shell)};
    const { cwd, events } = JSON.parse(process.argv[1]);
    fetchGit(['-q', 'origin', 'main'], { cwd }, (command, args, options) => {
      fs.appendFileSync(events, JSON.stringify({ phase: 'start', pid: process.pid }) + '\\n');
      const result = run(command, args, options);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
      fs.appendFileSync(events, JSON.stringify({ phase: 'end', pid: process.pid }) + '\\n');
      return result;
    });
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify({ cwd, events })], {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let error = '';

    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error))));
  });
}

describe('shared Git fetches', () => {
  it('serializes real fetches from concurrent processes across linked worktrees', async () => {
    const events = path.join(directory, 'events.jsonl');

    await Promise.all(worktrees.map((cwd) => fetchInChild(cwd, events)));

    const sequence = fs.readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse);
    const expected = git(remote, ['rev-parse', 'HEAD']);

    expect(sequence.map((event) => event.phase)).toEqual(['start', 'end', 'start', 'end', 'start', 'end']);

    for (let at = 0; at < sequence.length; at += 2) expect(sequence[at].pid).toBe(sequence[at + 1].pid);

    for (const cwd of worktrees) expect(git(cwd, ['rev-parse', 'origin/main'])).toBe(expected);
  });

  it('releases its claim when a fetch throws so the next fetch can proceed', () => {
    expect(() =>
      fetchGit(['origin'], { cwd: checkout }, () => {
        throw new Error('transport failed');
      }),
    ).toThrow('transport failed');
    expect(fs.existsSync(path.join(directory, 'locks', 'git-fetch.claim'))).toBe(false);
    expect(fetchGit(['-q', 'origin', 'main'], { cwd: checkout }).ok).toBe(true);
  });
});
