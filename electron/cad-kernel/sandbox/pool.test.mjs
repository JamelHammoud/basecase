import { afterEach, describe, expect, it, vi } from 'vitest';
import { KernelPool, MAX_RESULT_BYTES } from './pool.mjs';

afterEach(() => vi.useRealTimers());

const decode = (bytes) => JSON.parse(Buffer.from(bytes).toString());
const answer = (value) => Buffer.from(JSON.stringify(value));

function fakeSlots({ failToOpen = null } = {}) {
  const opened = [];
  const openSlot = (handlers) => {
    if (failToOpen) throw new Error(failToOpen);

    const slot = { handlers, jobs: [], killed: false, pid: 100 + opened.length };

    opened.push(slot);

    return {
      run: (job) => slot.jobs.push(job),
      pid: () => slot.pid,
      kill: () => {
        slot.killed = true;
      },
    };
  };

  return { opened, openSlot };
}

const pool = (slots, extra = {}) =>
  new KernelPool({ openSlot: slots.openSlot, size: 2, memoryLimitBytes: 1000, memoryOf: () => 0, ...extra });

describe('kernel pool', () => {
  it('reports a sandbox that cannot start, and never runs the job anywhere else', async () => {
    const result = await pool(fakeSlots({ failToOpen: 'its bundle is missing from this build' })).submit(
      { language: 'openscad', code: 'cube(1);' },
      1000,
    );

    expect(decode(result)).toEqual({
      ok: false,
      error: expect.stringMatching(/^The CAD kernel sandbox couldn't start: its bundle is missing/),
    });
  });

  it('times out a sandbox that never says it is ready', async () => {
    vi.useFakeTimers();

    const slots = fakeSlots();
    const pending = pool(slots, { startMs: 500 }).submit({ code: 'x' }, 1000);

    await vi.advanceTimersByTimeAsync(600);

    expect(decode(await pending).error).toMatch(/couldn't start: it took too long/);
    expect(slots.opened[0].killed).toBe(true);
  });

  it('kills a hung job at its time limit and runs the next job in a fresh window', async () => {
    vi.useFakeTimers();

    const slots = fakeSlots();
    const kernel = pool(slots, { size: 1 });
    const hung = kernel.submit({ language: 'replicad', code: 'while (true) {}' }, 3000);

    slots.opened[0].handlers.onReady();
    await vi.advanceTimersByTimeAsync(3001);

    expect(decode(await hung).error).toMatch(/took longer than 3 s/);
    expect(slots.opened[0].killed).toBe(true);

    const next = kernel.submit({ language: 'openscad', code: 'cube(1);' }, 3000);

    expect(slots.opened).toHaveLength(2);
    slots.opened[1].handlers.onReady();
    slots.opened[1].handlers.onResult(slots.opened[1].jobs[0].id, answer({ ok: true }));
    expect(decode(await next)).toEqual({ ok: true });
  });

  it('kills a job over the memory limit', async () => {
    vi.useFakeTimers();

    const slots = fakeSlots();
    const kernel = pool(slots, { memoryOf: () => 5000, pollMs: 100 });
    const job = kernel.submit({ code: 'x' }, 60000);

    slots.opened[0].handlers.onReady();
    await vi.advanceTimersByTimeAsync(150);

    expect(decode(await job).error).toMatch(/memory limit/);
    expect(slots.opened[0].killed).toBe(true);
  });

  it('ignores forged ids and stops a window that sends too much', async () => {
    const slots = fakeSlots();
    const kernel = pool(slots);
    const job = kernel.submit({ code: 'x' }, 60000);
    const slot = slots.opened[0];

    slot.handlers.onReady();
    slot.handlers.onResult(slot.jobs[0].id + 1, answer({ ok: true, forged: true }));
    slot.handlers.onResult(slot.jobs[0].id, new Uint8Array(MAX_RESULT_BYTES + 1));

    expect(decode(await job).error).toMatch(/bad result/);
    expect(slot.killed).toBe(true);
  });

  it('waits for a fresh worker after replicad code ran', async () => {
    const slots = fakeSlots();
    const kernel = pool(slots, { size: 1 });
    const first = kernel.submit({ language: 'replicad', code: 'return 1' }, 60000);
    const slot = slots.opened[0];

    slot.handlers.onReady();
    kernel.submit({ language: 'openscad', code: 'cube(1);' }, 60000);
    slot.handlers.onResult(slot.jobs[0].id, answer({ ok: true }));
    await first;

    expect(slot.jobs).toHaveLength(1);
    slot.handlers.onReady();
    expect(slot.jobs).toHaveLength(2);
  });

  it('answers every waiting job when the app closes', async () => {
    const slots = fakeSlots();
    const kernel = pool(slots, { size: 1 });
    const running = kernel.submit({ code: 'a' }, 60000);
    const queued = kernel.submit({ code: 'b' }, 60000);

    slots.opened[0].handlers.onReady();
    kernel.stop();

    expect(decode(await running).ok).toBe(false);
    expect(decode(await queued).ok).toBe(false);
    expect(slots.opened[0].killed).toBe(true);
  });
});
