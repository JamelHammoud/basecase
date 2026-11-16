import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => vi.fn());

vi.mock('./agent.mjs', () => ({ runAgent: model }));

const { checkedRun } = await import('./preflight.mjs');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-preflight-'));
const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

git('init', '-q');
fs.writeFileSync(path.join(cwd, 'README.md'), 'A fixture.\n');
git('add', 'README.md');
git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture');
git('update-ref', 'refs/remotes/origin/main', 'HEAD');

const session = { provider: 'codex', id: 'builder-session' };
const task = {
  cwd,
  name: 'build',
  prompt: 'The original full feature task.',
  schema: {},
  kind: 'feature',
  log: vi.fn(),
};
const first = {
  ok: true,
  session,
  output: { changed: true, outcome: { status: 'complete' }, kind: 'feature', copy: [] },
};

afterEach(() => vi.clearAllMocks());
afterAll(() => fs.rmSync(cwd, { recursive: true, force: true }));

describe('preflight continuation', () => {
  it('sends only current findings to the original builder context', () => {
    model.mockReturnValueOnce(first).mockReturnValueOnce(first);
    checkedRun(task);

    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][0].continuation).toBe(session);
    expect(model.mock.calls[1][0].prompt).toContain('preflight findings');
    expect(model.mock.calls[1][0].prompt).not.toContain(task.prompt);
  });

  it('preserves a failed correction instead of publishing metadata from before its edits', () => {
    const failed = { ok: false, session, error: 'worker stopped' };

    model.mockReturnValueOnce(first).mockReturnValueOnce(failed);

    expect(checkedRun(task)).toBe(failed);
  });

  it('retains the original session when a correction fails before returning its session', () => {
    model.mockReturnValueOnce(first).mockReturnValueOnce({ ok: false, error: 'worker unavailable' });

    expect(checkedRun(task)).toMatchObject({ ok: false, session, error: 'worker unavailable' });
  });

  it('keeps the original session on a thrown correction error', () => {
    const failure = new Error('provider unavailable');

    model.mockReturnValueOnce(first).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => checkedRun(task)).toThrow(failure);
    expect(failure.session).toEqual(session);
  });
});

it.each([undefined, { status: 'incomplete' }, { status: 'unknown' }])(
  'does not spend a preflight correction on unfinished or invalid build outcome %j',
  (outcome) => {
    const unfinished = { ok: true, session, output: { changed: true, kind: 'feature', outcome } };

    model.mockReturnValueOnce(unfinished);
    expect(checkedRun(task)).toBe(unfinished);
    expect(model).toHaveBeenCalledOnce();
  },
);
