import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitScheduler } from './kitScheduler.mjs';
import { PRIORITY } from './trainer.mjs';

const DEBOUNCE_MS = 100;

function fakeTrainer() {
  const started = [];

  return {
    started,
    release: vi.fn(() => Promise.resolve()),
    start: (entry) => {
      started.push(entry);

      return { jobId: `job-${started.length}` };
    },
  };
}

describe('Kit scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts only the latest request of a burst, at Kit priority, and says which job it started', async () => {
    const trainer = fakeTrainer();
    const scheduler = new KitScheduler({ trainer, debounceMs: DEBOUNCE_MS });
    const first = scheduler.request({ workspaceId: 's', xml: '<a/>', job: { name: 'A' } });
    const second = scheduler.request({ workspaceId: 's', xml: '<b/>', job: { name: 'B' } });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);

    expect(await first).toEqual({ jobId: null });
    expect(await second).toEqual({ jobId: 'job-1' });
    expect(trainer.started).toEqual([
      { workspaceId: 'kit:s', xml: '<b/>', job: { name: 'B' }, priority: PRIORITY.kit },
    ]);
    expect(trainer.release).toHaveBeenCalledWith('kit:s');
  });

  it('settles a cancelled request with no job', async () => {
    const trainer = fakeTrainer();
    const scheduler = new KitScheduler({ trainer, debounceMs: DEBOUNCE_MS });
    const asked = scheduler.request({ workspaceId: 's', xml: '<a/>', job: { name: 'A' } });

    await scheduler.cancel('s');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);

    expect(await asked).toEqual({ jobId: null });
    expect(trainer.started).toEqual([]);
  });

  it('settles with no job when the trainer refuses', async () => {
    const trainer = {
      release: () => Promise.resolve(),
      start: () => {
        throw new Error('This scene is already training.');
      },
    };
    const scheduler = new KitScheduler({ trainer, debounceMs: DEBOUNCE_MS });
    const asked = scheduler.request({ workspaceId: 's', xml: '<a/>', job: { name: 'A' } });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(await asked).toEqual({ jobId: null });
  });
});
