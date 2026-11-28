import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { activeRepairEvidence } from './activeRepairEvidence.mjs';

const fixture = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'active-repairs-'));

  return { dir, locks: path.join(dir, 'locks'), worktrees: path.join(dir, 'worktrees'), records: vi.fn() };
});

vi.mock('./paths.mjs', () => ({ LOCKS: fixture.locks, WORKTREES: fixture.worktrees }));
vi.mock('./sessionJournal.mjs', () => ({ sessionRecords: fixture.records }));

const session = (overrides = {}) => ({
  name: 'repair',
  state: 'running',
  worker: 'repair-1',
  task: 'loop-repair-main-abcdef-123',
  startedAt: 100,
  pid: process.pid,
  ...overrides,
});

beforeEach(() => {
  fs.rmSync(fixture.locks, { recursive: true, force: true });
  fs.rmSync(fixture.worktrees, { recursive: true, force: true });
  fs.mkdirSync(fixture.locks, { recursive: true });
  fs.writeFileSync(path.join(fixture.locks, 'repair-1.lock'), String(process.pid));
  fixture.records.mockReset().mockReturnValue([session()]);
});
afterAll(() => fs.rmSync(fixture.dir, { recursive: true, force: true }));

it('carries a live unpublished repair and its bounded diagnostic handoff without changing either', () => {
  const worktree = path.join(fixture.worktrees, session().task);
  const handoff = path.join(worktree, 'scratch', 'task-handoff.json');
  const content = JSON.stringify({ diagnostics: [{ revision: 'abcdef', platform: 'windows' }] });

  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, content);
  expect(activeRepairEvidence()).toEqual([
    { worker: 'repair-1', pid: process.pid, startedAt: 100, worktree, handoff: content },
  ]);
  expect(fs.readFileSync(handoff, 'utf8')).toBe(content);
  fs.writeFileSync(handoff, 'x'.repeat(9000));
  expect(activeRepairEvidence()[0].handoff).toHaveLength(8000);
});

it('excludes completed sessions, other lanes and work without its live worker lock', () => {
  fixture.records.mockReturnValue([
    session({ state: 'completed' }),
    session({ name: 'doctor' }),
    session({ worker: 'repair-2' }),
    session({ pid: process.pid + 1 }),
    session({ worker: '../repair-1' }),
    session({ task: '../outside' }),
  ]);
  expect(activeRepairEvidence()).toEqual([]);
  fs.writeFileSync(path.join(fixture.locks, 'repair-1.lock'), String(Number.MAX_SAFE_INTEGER));
  fixture.records.mockReturnValue([session({ pid: Number.MAX_SAFE_INTEGER })]);
  expect(activeRepairEvidence()).toEqual([]);
});

it('uses the newest invocation per live worker and keeps a repair visible before its handoff exists', () => {
  fixture.records.mockReturnValue([
    session({ task: 'loop-repair-new', startedAt: 200 }),
    session({ task: 'loop-repair-old', startedAt: 100 }),
  ]);
  expect(activeRepairEvidence()).toEqual([
    {
      worker: 'repair-1',
      pid: process.pid,
      startedAt: 200,
      worktree: path.join(fixture.worktrees, 'loop-repair-new'),
      handoff: null,
    },
  ]);
});

it('reports an unreadable session journal without blocking doctor evidence preparation', () => {
  fixture.records.mockImplementation(() => {
    throw new Error('Journal unavailable');
  });
  expect(activeRepairEvidence()).toEqual({ unavailable: true });
});
