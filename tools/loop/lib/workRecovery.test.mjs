import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { run } from './sh.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-recovery-'));

vi.stubEnv('BASECASE_LOOP_DIR', directory);

const { saveRecovery, recoveryFor, recoveryReady, clearRecovery, hasRecovery, refreshRecovery } =
  await import('./workRecovery.mjs');

const git = (cwd, ...args) => run('git', args, { cwd });

function recoveryCheckout() {
  const root = fs.mkdtempSync(path.join(directory, 'checkout-'));
  const main = path.join(root, 'main');
  const dir = path.join(root, 'recovery');

  fs.mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.name', 'test');
  git(main, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(main, '.gitattributes'), '* text eol=lf\n');
  fs.writeFileSync(path.join(main, 'source.txt'), 'original source\n');
  fs.writeFileSync(path.join(main, 'retained.txt'), 'original work\n');
  git(main, 'add', '.');
  git(main, 'commit', '-qm', 'fixture');
  git(root, 'clone', '-q', '-c', 'core.autocrlf=true', main, dir);
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.com');

  return { main, dir };
}

function updateMain(main) {
  fs.writeFileSync(path.join(main, 'source.txt'), 'new source\n');
  git(main, 'add', 'source.txt');
  git(main, 'commit', '-qm', 'update source');
}

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('builder recovery', () => {
  it('retains a failed session and permits one recovery for the same inputs', () => {
    const worktree = { dir: directory, branch: 'loop/build/42-feature' };
    const session = { provider: 'codex', id: 'saved-thread' };
    const first = saveRecovery(42, { worktree, session, inputSignature: 'source-a' });

    expect(recoveryReady(first, 'source-a')).toBe(true);
    expect(recoveryFor(42).session.id).toBe('saved-thread');
    expect(hasRecovery(directory)).toBe(true);

    const second = saveRecovery(42, { worktree, session, inputSignature: 'source-a' });

    expect(recoveryReady(second, 'source-a')).toBe(false);
    expect(recoveryReady(second, 'source-b')).toBe(true);
    clearRecovery(42);
    expect(hasRecovery(directory)).toBe(false);
  });

  it('updates changed main inputs while retaining unfinished edits', () => {
    const worktree = recoveryCheckout();

    fs.writeFileSync(path.join(worktree.dir, 'retained.txt'), 'unfinished work\n');
    fs.writeFileSync(path.join(worktree.dir, 'new.txt'), 'untracked work\n');
    updateMain(worktree.main);
    refreshRecovery(worktree);

    expect(fs.readFileSync(path.join(worktree.dir, 'source.txt'), 'utf8')).toBe('new source\n');
    expect(fs.readFileSync(path.join(worktree.dir, 'retained.txt'), 'utf8')).toBe('unfinished work\n');
    expect(fs.readFileSync(path.join(worktree.dir, 'new.txt'), 'utf8')).toBe('untracked work\n');
  });

  it('keeps conflicting unfinished edits available to the resumed builder', () => {
    const worktree = recoveryCheckout();

    fs.writeFileSync(path.join(worktree.dir, 'source.txt'), 'unfinished source\n');
    updateMain(worktree.main);

    const context = refreshRecovery(worktree);
    const source = fs.readFileSync(path.join(worktree.dir, 'source.txt'), 'utf8');

    expect(source).toContain('unfinished source');
    expect(source).toContain('new source');
    expect(git(worktree.dir, 'diff', '--name-only', '--diff-filter=U').out).toBe('source.txt');
    expect(context).toContain('resolve any merge or autostash conflicts');
  });
});
