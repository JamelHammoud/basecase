import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comparison } from './fixtures/efficiency.mjs';

const fixture = vi.hoisted(() => ({
  model: 'claude-opus-5-5',
  tasks: [{ id: 'A1' }],
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
vi.mock('../micro/tasks/index.mjs', () => ({ selectTasks: () => fixture.tasks, runnable: () => true }));
vi.mock('./against.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  checkoutRef: () => ({ label: 'main', commit: 'abc1234', remove: fixture.remove }),
}));
vi.mock('./arms.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  againstArms: () => [
    { label: 'working tree', model: fixture.model, harness: 'tree', git: { commit: 'abc1234', dirty: true } },
    { label: 'main', model: fixture.model, harness: 'ref', git: { commit: 'abc1234', dirty: false } },
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

it.each(['codex', 'wrong snapshot', 'wrong response', 'claude allowance', 'efficiency'])(
  'checks %s through the comparison command',
  async (scenario) => {
    vi.resetModules();
    vi.clearAllMocks();
    tree = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-provider-test-'));

    const provider = scenario === 'claude allowance' ? 'claude' : 'codex';

    fixture.model = provider === 'claude' ? 'claude-opus-5-5' : 'gpt-6.1-sol';

    const close = vi.fn();
    const pool = { studios: [{ base: 'http://first' }, { base: 'http://second' }], slots: [{ post: vi.fn() }], close };
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    fixture.openSlotPool.mockResolvedValue(pool);
    fixture.runMicroOnce.mockResolvedValue({
      grade: { status: 'pass' },
      status: 'pass',
      task: 'A1',
      seed: 1,
      servedBy: scenario === 'wrong response' ? 'claude-opus-5-5' : fixture.model,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        json: async () => ({
          agentKind: scenario === 'wrong snapshot' && url.includes('second') ? 'claude' : provider,
          models: [{ id: fixture.model, effortLevels: [{ id: 'medium' }] }],
        }),
      })),
    );

    if (scenario === 'efficiency') {
      fixture.tasks = Array.from({ length: 6 }, (_, i) => ({ id: `T${i}` }));
      fixture.runMicroOnce.mockImplementation(async ({ task, out }) => {
        const arm = out.dir.includes('working-tree') ? 0 : 1;
        const run = comparison().results.find(
          (row) => row.task === task.id && row.model === (arm ? 'main' : 'working tree'),
        );

        return { ...run, grade: { status: run.status, checks: run.checks } };
      });
    }

    process.argv = [
      process.execPath,
      'bench/compare.mjs',
      '--against',
      'main',
      '--model',
      fixture.model,
      '--effort',
      'medium',
      '--seeds',
      '1',
      '--no-cache',
      ...(scenario === 'claude allowance' ? ['--loop-allowance', '--parallel', '8'] : []),
      '--runs-dir',
      tree,
      '--run',
      'provider',
    ];
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../compare.mjs');

    const result = JSON.parse(fs.readFileSync(path.join(tree, 'provider/results.json'), 'utf8'));

    expect(result.provider).toBe(provider);
    expect(result.effort).toBe('medium');
    expect(close).toHaveBeenCalledTimes(2);
    expect(fixture.remove).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();

    if (['codex', 'claude allowance'].includes(scenario)) {
      expect(result.plan.stop).toBe('rounds');
      expect(result.results).toHaveLength(2);
      expect(fixture.openSlotPool.mock.calls.every(([options]) => options.provider === provider)).toBe(true);
    }

    if (scenario === 'claude allowance') {
      expect(result.plan.parallel).toBe(1);
      expect(fixture.openSlotPool.mock.calls.every(([options]) => options.parallel === 1)).toBe(true);
      expect(fixture.runMicroOnce.mock.calls.every(([options]) => typeof options.turn === 'function')).toBe(true);
    }

    if (scenario === 'efficiency') expect(result.outcome.outcome).toBe('efficiency-win');

    if (scenario === 'wrong snapshot') {
      expect(result.plan.stop).toBe('error');
      expect(fixture.runMicroOnce).not.toHaveBeenCalled();
    }

    if (scenario === 'wrong response') expect(result.plan.stop).toBe('served');

    vi.unstubAllGlobals();
    fixture.model = 'claude-opus-5-5';
    fixture.tasks = [{ id: 'A1' }];
  },
);
