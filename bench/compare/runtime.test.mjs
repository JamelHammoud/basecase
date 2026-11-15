import { afterEach, describe, expect, it, vi } from 'vitest';
import { bounded, comparisonLimits, guardedOutput, guardedSlot, runBoundedJobs } from './runtime.mjs';

afterEach(() => vi.useRealTimers());

describe('comparison runtime', () => {
  it('caps wall and task budgets and rejects values that cannot bound a run', () => {
    expect(comparisonLimits([])).toEqual({ minutes: 30, taskSeconds: 120 });
    expect(comparisonLimits(['--minutes', '90', '--task-seconds', '600'])).toEqual({ minutes: 30, taskSeconds: 120 });

    for (const value of ['0', '-1', 'NaN', 'Infinity']) {
      expect(() => comparisonLimits(['--minutes', value])).toThrow('minutes');
      expect(() => comparisonLimits(['--task-seconds', value])).toThrow('task-seconds');
    }
  });

  it('includes startup in the wall deadline and closes a pool that arrives late', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const late = vi.fn();
    const startup = bounded(() => new Promise((resolve) => setTimeout(() => resolve({ close: late }), 80)), {
      deadline: 50,
      late: (pool) => pool.close(),
    });
    const check = expect(startup).rejects.toMatchObject({ code: 'deadline' });

    await vi.advanceTimersByTimeAsync(50);
    await check;
    await vi.advanceTimersByTimeAsync(30);
    expect(late).toHaveBeenCalledOnce();
  });

  it('rejects synchronous startup that overruns before the timer can fire', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const late = vi.fn();

    await expect(
      bounded(
        () => {
          vi.setSystemTime(100);

          return 'late';
        },
        { deadline: 50, late },
      ),
    ).rejects.toMatchObject({ code: 'deadline' });
    expect(late).toHaveBeenCalledWith('late');
  });

  it('counts a hung task as failed, cancels it and never reuses its slot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const slot = { post: vi.fn().mockResolvedValue({}) };
    const run = vi.fn(() => new Promise(() => {}));
    const record = vi.fn();
    const work = runBoundedJobs({
      slots: [slot],
      jobs: [{ task: { id: 'A' }, seed: 1, label: 'tree' }, { task: { id: 'B' } }],
      run,
      record,
      deadline: 1000,
      taskSeconds: 0.05,
    });

    await vi.advanceTimersByTimeAsync(50);
    await work;
    expect(run).toHaveBeenCalledOnce();
    expect(slot.retired).toBe(true);
    expect(slot.post).toHaveBeenCalledWith('/api/bridge/acp-cancel');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ task: 'A', status: 'fail', timedOut: true }));
  });

  it('stops scheduling when the wall budget expires without waiting for a hung task', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const record = vi.fn();
    const run = vi.fn(() => new Promise(() => {}));
    const state = { stop: null };
    const work = runBoundedJobs({
      slots: [{ post: vi.fn().mockResolvedValue({}) }],
      jobs: [{ task: { id: 'A' } }, { task: { id: 'B' } }],
      run,
      record,
      state,
      deadline: 30,
      taskSeconds: 120,
    });

    await vi.advanceTimersByTimeAsync(30);
    await work;
    expect(state.stop).toBe('deadline');
    expect(run).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail', timeout: 'deadline' }));
  });

  it('keeps partial results when a task errors and continues with healthy slots', async () => {
    const record = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error('broken grader')).mockResolvedValueOnce({ status: 'pass' });

    await runBoundedJobs({
      slots: [{}],
      jobs: [{ task: { id: 'A' } }, { task: { id: 'B' } }],
      run,
      record,
      deadline: Date.now() + 1000,
      taskSeconds: 120,
    });
    expect(record.mock.calls.map(([result]) => result.status)).toEqual(['error', 'pass']);
  });
});

describe('retired comparison slots', () => {
  it('blocks late prompt replies and further scene access after retirement', async () => {
    const controller = new AbortController();
    let reply;
    const slot = {
      post: () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
      api: vi.fn(),
    };
    const guarded = guardedSlot(slot, controller.signal);
    const prompt = guarded.post('prompt');

    controller.abort(new Error('retired'));
    reply({ ok: true });
    await expect(prompt).rejects.toThrow('retired');
    await expect(guarded.api('sceneRecord')).rejects.toThrow('retired');
    expect(slot.api).not.toHaveBeenCalled();
  });

  it('blocks archiving when a grader returns after the task deadline', () => {
    const controller = new AbortController();
    const git = { commit: 'abc' };
    const out = guardedOutput({ git, dir: 'runs/task' }, controller.signal);

    expect(out.git).toBe(git);
    controller.abort(new Error('retired'));
    expect(() => out.git).toThrow('retired');
  });

  it('moves queued work through a healthy slot when another slot times out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const record = vi.fn();
    const run = vi.fn(async (job) => {
      await new Promise((resolve) => setTimeout(resolve, job.task.id === 'hung' ? 500 : 20));

      return { task: job.task.id, status: 'pass' };
    });
    const work = runBoundedJobs({
      slots: [{ post: vi.fn() }, {}],
      jobs: ['hung', 'A', 'B', 'C', 'D'].map((id) => ({ task: { id } })),
      run,
      record,
      deadline: 1000,
      taskSeconds: 0.05,
    });

    await vi.advanceTimersByTimeAsync(80);
    await work;
    expect(record.mock.calls.map(([result]) => result.task).sort()).toEqual(['A', 'B', 'C', 'D', 'hung']);
    expect(record.mock.calls.find(([result]) => result.task === 'hung')[0].status).toBe('fail');
  });
});
