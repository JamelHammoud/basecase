import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  remove: vi.fn(),
  openSlotPool: vi.fn(),
  closeAppModules: vi.fn(),
  runMicroOnce: vi.fn(),
}));

vi.mock('../harness.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  root: '.',
}));
vi.mock('../archive.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  gitInfo: () => ({ commit: 'abc1234', dirty: true }),
}));
vi.mock('../slots.mjs', () => ({ openSlotPool: fixture.openSlotPool }));
vi.mock('../micro/once.mjs', () => ({ runMicroOnce: fixture.runMicroOnce }));
vi.mock('../micro/scenes.mjs', () => ({ closeAppModules: fixture.closeAppModules }));
vi.mock('../micro/tasks/index.mjs', () => ({ selectTasks: () => [{ id: 'A1' }], runnable: () => true }));
vi.mock('./against.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  checkoutRef: () => ({ label: 'main', commit: 'abc1234', remove: fixture.remove }),
}));
vi.mock('./arms.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  againstArms: () => [
    { label: 'working tree', model: 'claude-opus-5-5', harness: 'tree', git: { commit: 'abc1234', dirty: true } },
    { label: 'main', model: 'claude-opus-5-5', harness: 'ref', git: { commit: 'abc1234', dirty: false } },
  ],
}));

let tree;
const argv = process.argv;
const events = ['exit', 'SIGINT', 'SIGTERM'];
const listeners = new Map(events.map((event) => [event, new Set(process.listeners(event))]));

afterEach(() => {
  for (const event of events) {
    for (const listener of process.listeners(event).filter((item) => !listeners.get(event).has(item))) {
      process.removeListener(event, listener);
    }
  }

  process.argv = argv;
  vi.restoreAllMocks();
  vi.useRealTimers();
  fs.rmSync(tree, { recursive: true, force: true });
});

describe('comparison command', () => {
  it('persists a deadline report and cleans up the reference without starting an app', async () => {
    tree = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-cli-test-'));

    const runsDir = path.join(tree, 'reports');
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    process.argv = [
      process.execPath,
      'bench/compare.mjs',
      '--against',
      'main',
      '--tasks',
      'A1',
      '--minutes',
      '0.00000001',
      '--runs-dir',
      runsDir,
      '--run',
      'deadline',
      '--no-cache',
    ];
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    vi.spyOn(process, 'uptime').mockReturnValue(1);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../compare.mjs');

    const results = JSON.parse(fs.readFileSync(path.join(runsDir, 'deadline/results.json'), 'utf8'));
    const report = fs.readFileSync(path.join(runsDir, 'deadline/report.md'), 'utf8');

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(results.plan.stop).toBe('deadline');
    expect(results.plan.rounds).toBe(0);
    expect(results.plan.tasks).toBe(1);
    expect(results.plan.elapsedSeconds).toBe(1);
    expect(results.results).toEqual([]);
    expect(results.arms).toEqual([
      { label: 'working tree', harness: 'tree', git: { commit: 'abc1234', dirty: true } },
      { label: 'main', harness: 'ref', git: { commit: 'abc1234', dirty: false } },
    ]);
    expect(report).toContain('# working tree vs main');
    expect(report).toMatch(/deadline|time limit/i);
    expect(fixture.remove).toHaveBeenCalledOnce();
    expect(fixture.closeAppModules).toHaveBeenCalledOnce();
    expect(fixture.openSlotPool).not.toHaveBeenCalled();
    expect(fixture.runMicroOnce).not.toHaveBeenCalled();
  });
});
