import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { run } from '../lib/sh.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-revise-'));
const calls = vi.hoisted(() => ({ checkedRun: vi.fn(), publish: vi.fn(), pulls: [] }));

vi.stubEnv('BASECASE_LOOP_DIR', directory);
vi.mock('../lib/agent.mjs', () => ({ CHANGE_SCHEMA: { properties: {} } }));
vi.mock('../lib/branches.mjs', () => ({ fetchAll: vi.fn(), conflictsWithMain: () => false }));
vi.mock('../lib/github.mjs', () => ({
  checkRunFor: () => null,
  createPull: vi.fn(),
  editPull: vi.fn(),
  editPullLabels: vi.fn(),
  failedLog: () => '',
  isLoopComment: () => false,
  openPulls: () => calls.pulls,
  pullCheck: () => 'failure',
  pullComments: () => [],
  pullReview: () => 'pending',
  setReview: vi.fn(),
}));
vi.mock('../lib/preflight.mjs', () => ({ checkedRun: calls.checkedRun }));
vi.mock('../lib/pull.mjs', () => ({ kindOf: () => 'fix', REVISED_FIELDS: [] }));
vi.mock('../lib/rebuild.mjs', () => ({ rebuild: vi.fn() }));
vi.mock('../lib/revision.mjs', () => ({ publishRevision: calls.publish }));

const { default: revise } = await import('./revise.mjs');
const { deliver } = await import('../lib/deliver.mjs');
const { deliveryFor, saveDelivery } = await import('../lib/deliveryState.mjs');
const { close } = await import('../lib/worktree.mjs');
const home = path.join(directory, 'home');
const origin = path.join(directory, 'origin.git');
const owner = path.join(directory, 'owner');
const branch = 'loop/fix/imports';
const git = (cwd, ...args) => run('git', args, { cwd }).out;

function commitTree(cwd, message, parent) {
  const tree = git(cwd, 'write-tree');
  const sha = git(cwd, 'commit-tree', tree, '-m', message, ...(parent ? ['-p', parent] : []));

  git(cwd, 'update-ref', 'HEAD', sha);

  return sha;
}

function fixture() {
  fs.mkdirSync(home);
  git(directory, 'init', '-q', '--bare', origin);
  git(home, 'init', '-q', '-b', 'main');
  git(home, 'config', 'user.name', 'test');
  git(home, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(home, 'source.txt'), 'original\n');
  git(home, 'add', '.');

  const original = commitTree(home, 'original');

  git(home, 'branch', branch);
  git(home, 'remote', 'add', 'origin', origin);
  git(home, 'push', '-q', 'origin', 'main', branch);
  git(home, 'worktree', 'add', '-q', owner, branch);
  fs.writeFileSync(path.join(owner, 'source.txt'), 'unfinished owner edits\n');

  const published = commitTree(home, 'published main', original);

  git(home, 'push', '-q', 'origin', `HEAD:refs/heads/${branch}`);
  fs.mkdirSync(path.join(directory, 'worktrees'));

  return { original, published };
}

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('revises an occupied branch from its remote head and recovers detached delivery without touching its owner', () => {
  const { original, published } = fixture();
  const number = 42;
  const dir = path.join(directory, 'worktrees', `revise-${number}`);
  const pull = { number, headRefName: branch, headRefOid: published, updatedAt: '2026-11-21T00:00:00Z' };
  const edit = vi.fn();
  const services = {
    execute: run,
    readJson: () => ({ url: 'https://example.com/pull/42', state: 'OPEN', headRefOid: published }),
    edit,
  };
  let revised;

  expect(() => git(home, 'worktree', 'add', '-q', '-B', branch, path.join(directory, 'blocked'), published)).toThrow(
    'already used by worktree',
  );
  calls.pulls = [pull];
  calls.checkedRun.mockImplementation(({ cwd }) => {
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(published);
    expect(git(cwd, 'branch', '--show-current')).toBe('');
    fs.writeFileSync(path.join(cwd, 'revision.txt'), 'revision\n');
    git(cwd, 'add', '.');
    revised = commitTree(cwd, 'revision', published);

    return { ok: true, output: { changed: true, revision: 'Fix imports' } };
  });
  calls.publish.mockImplementation((_pull, worktree) => {
    const saved = saveDelivery({ branch, number, dir: worktree.dir, sha: revised, title: 'Fix imports', body: '' });

    return deliver(saved, {
      ...services,
      execute: (command, args, options) => {
        if (args[0] === 'push') throw new Error('network down');

        return run(command, args, options);
      },
    });
  });

  expect(() => revise({ log: vi.fn() })).toThrow('network down');
  expect(calls.checkedRun).toHaveBeenCalledOnce();
  expect(fs.existsSync(dir)).toBe(true);
  expect(deliveryFor(branch)).toMatchObject({ sha: revised, attempts: 1 });
  expect(deliver(deliveryFor(branch), services)).toBe('https://example.com/pull/42');
  expect(git(origin, 'rev-parse', `refs/heads/${branch}`)).toBe(revised);
  expect(git(home, 'rev-parse', `refs/heads/${branch}`)).toBe(original);
  expect(git(owner, 'rev-parse', 'HEAD')).toBe(original);
  expect(git(owner, 'branch', '--show-current')).toBe(branch);
  expect(fs.readFileSync(path.join(owner, 'source.txt'), 'utf8')).toBe('unfinished owner edits\n');
  expect(edit).toHaveBeenCalledOnce();
  expect(deliveryFor(branch)).toBeNull();
  close({ dir });
  expect(fs.existsSync(dir)).toBe(false);
  expect(fs.existsSync(owner)).toBe(true);
});
