import { afterEach, expect, it, vi } from 'vitest';
import { routeMemory } from './routeMemory.mjs';

const native = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('./process.mjs', () => ({ boardProcess: native.run }));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each([512 * 1024 * 1024, 769 * 1024 * 1024, -1, 'bad'])(
  'bounds sampled resident memory and joins the observer for %s',
  async (rss) => {
    vi.useFakeTimers();
    native.run.mockResolvedValue(JSON.stringify({ rss }));

    const metrics = { peakRssBytes: 0 };
    const stop = vi.fn();
    const close = routeMemory({ python: 'python', cwd: 'job', signal: new AbortController().signal, metrics })(
      123,
      stop,
    );

    await vi.advanceTimersByTimeAsync(250);
    await close();

    const safe = typeof rss === 'number' && rss >= 0 && rss <= 768 * 1024 * 1024;

    expect(stop).toHaveBeenCalledTimes(safe ? 0 : 1);

    if (!safe) expect(stop.mock.calls[0][0].message).toBe('board-route-limit');

    const observed = native.run.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect(native.run).toHaveBeenCalledTimes(observed);
  },
);
