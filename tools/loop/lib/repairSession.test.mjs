import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runAgent } from './agent.mjs';
import { hasPendingWorktree } from './deliveryState.mjs';
import { expandsTestExclusions } from './repairCoverage.mjs';
import { run } from './sh.mjs';

vi.mock('./agent.mjs', () => ({ CHANGE_SCHEMA: {}, runAgent: vi.fn() }));
vi.mock('./deliveryState.mjs', () => ({
  hasPendingWorktree: vi.fn(() => false),
  hasPendingDelivery: () => false,
}));
vi.mock('./repairCoverage.mjs', () => ({ expandsTestExclusions: vi.fn(() => false) }));
vi.mock('./worktree.mjs', async (original) => ({ ...(await original()), openBranch: vi.fn() }));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-session-'));

vi.stubEnv('BASECASE_LOOP_DIR', root);

const { repairSession } = await import('./repairSession.mjs');
const { clearRecovery, recoveryFor } = await import('./workRecovery.mjs');
const { close, openBranch } = await import('./worktree.mjs');
const home = path.join(root, 'home');
const worktrees = [];

fs.mkdirSync(home);
run('git', ['init', '-q', '-b', 'main'], { cwd: home });
fs.writeFileSync(path.join(home, 'source.txt'), 'original');
run('git', ['add', '.'], { cwd: home });
run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: home });

beforeEach(() => {
  vi.clearAllMocks();
  hasPendingWorktree.mockReturnValue(false);
  expandsTestExclusions.mockReturnValue(false);
  openBranch.mockImplementation(() => {
    const branch = `repair-${worktrees.length}`;
    const dir = path.join(root, branch);

    run('git', ['worktree', 'add', '-q', '-b', branch, dir], { cwd: home });
    worktrees.push({ dir, branch });

    return { dir, branch };
  });
});
afterEach(() => {
  hasPendingWorktree.mockReturnValue(false);
  clearRecovery('repair-repair');
  clearRecovery('repair-doctor');
  worktrees.forEach(close);
});
afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

const task = (name = 'repair') => ({
  name,
  slug: 'failed-main',
  prompt: () => 'Current failed jobs',
  options: () => ({ deadlineAt: Date.now() + 30 * 60_000 }),
  complete: vi.fn(),
  log: vi.fn(),
});

it.each(['repair', 'doctor'])('resumes %s edits and context on the next ordinary visit', (name) => {
  const session = { provider: 'codex', id: 'retained-thread' };
  const request = task(name);

  runAgent.mockImplementationOnce(({ cwd }) => {
    fs.writeFileSync(path.join(cwd, 'source.txt'), 'unfinished repair');
    fs.mkdirSync(path.join(cwd, 'scratch'));
    fs.writeFileSync(path.join(cwd, 'scratch', 'task-handoff.json'), '{"checked":"source traced"}');

    return { ok: false, error: 'spawnSync codex ETIMEDOUT', session };
  });
  repairSession(request);

  const retained = recoveryFor(`repair-${name}`);

  expect(fs.readFileSync(path.join(retained.dir, 'source.txt'), 'utf8')).toBe('unfinished repair');
  expect(fs.existsSync(path.join(retained.dir, 'scratch', 'task-handoff.json'))).toBe(true);
  expect(request.complete).not.toHaveBeenCalled();
  runAgent.mockImplementationOnce(({ cwd, continuation, prompt, deadlineAt }) => {
    expect(cwd).toBe(retained.dir);
    expect(continuation).toEqual(session);
    expect(prompt).toContain('ETIMEDOUT');
    expect(prompt).toContain('Current failed jobs');
    expect(deadlineAt).toBeLessThanOrEqual(Date.now() + 30 * 60_000);

    return { ok: true, output: { changed: true } };
  });
  repairSession(request);
  expect(openBranch).toHaveBeenCalledOnce();
  expect(request.complete).toHaveBeenCalledWith({ changed: true }, { dir: retained.dir, branch: retained.branch });
  expect(recoveryFor(`repair-${name}`)).toBeNull();
  expect(fs.existsSync(retained.dir)).toBe(false);
});

it('retains thrown execution and publication failures without recording completion', () => {
  const request = task();
  const session = { provider: 'codex', id: 'thrown-thread' };

  runAgent.mockImplementationOnce(() => {
    throw Object.assign(new Error('provider unavailable'), { session });
  });
  expect(() => repairSession(request)).toThrow('provider unavailable');
  expect(recoveryFor('repair-repair').session).toEqual(session);
  runAgent.mockReturnValue({ ok: true, output: { changed: true } });
  request.complete.mockImplementationOnce(() => {
    throw new Error('publication preparation failed');
  });
  expect(() => repairSession(request)).toThrow('publication preparation failed');
  expect(recoveryFor('repair-repair').reason).toBe('publication preparation failed');
  repairSession(request);
  expect(openBranch).toHaveBeenCalledOnce();
  expect(recoveryFor('repair-repair')).toBeNull();
});

it('hands prepared publication failures to delivery instead of retaining two owners', () => {
  const request = task();

  runAgent.mockReturnValue({ ok: true, output: { changed: true } });
  request.complete.mockImplementation(() => {
    hasPendingWorktree.mockReturnValue(true);

    throw new Error('push failed');
  });
  expect(() => repairSession(request)).toThrow('push failed');
  expect(recoveryFor('repair-repair')).toBeNull();
  expect(fs.existsSync(worktrees.at(-1).dir)).toBe(true);
});

it('discards a refused coverage expansion and leaves the next visit eligible', () => {
  const request = task();

  runAgent.mockReturnValueOnce({ ok: false, error: 'interrupted' });
  repairSession(request);
  runAgent.mockReturnValue({ ok: true, output: { changed: true } });
  expandsTestExclusions.mockReturnValueOnce(true);
  repairSession(request);
  expect(request.complete).not.toHaveBeenCalled();
  expect(recoveryFor('repair-repair')).toBeNull();
  expect(fs.existsSync(worktrees.at(-1).dir)).toBe(false);
  repairSession(request);
  expect(request.complete).toHaveBeenCalledOnce();
  expect(openBranch).toHaveBeenCalledTimes(2);
});
