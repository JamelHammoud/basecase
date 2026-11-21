import { afterEach, describe, expect, it, vi } from 'vitest';
import { AngleTrace, type Angles } from './robotGap';

class CopiedTrace {
  private times: number[] = [];
  private angles: Angles[] = [];
  copiedEntries = 0;

  record(atMs: number, angles: Angles) {
    this.times.push(atMs);
    this.angles.push(angles);

    const stale = this.times.findIndex((t) => t >= atMs - 5000);

    if (stale <= 0) return;

    this.times = this.times.slice(stale);
    this.angles = this.angles.slice(stale);
    this.copiedEntries += this.times.length * 2;
  }

  at(ms: number): Angles | null {
    let found: Angles | null = null;

    for (let i = 0; i < this.times.length; i++) {
      if (this.times[i] <= ms) found = this.angles[i];
    }

    return found;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('angle history storage', () => {
  it('keeps the cutoff inclusive and selects the last sample at an equal time', () => {
    const trace = new AngleTrace();
    const first: Angles = [0, null];
    const second: Angles = [1];
    const duplicate: Angles = [2, -1];

    expect(trace.at(0)).toBeNull();
    trace.record(0, first);
    trace.record(5000, second);
    expect(trace.at(-1)).toBeNull();
    expect(trace.at(0)).toBe(first);
    expect(trace.at(4999)).toBe(first);
    trace.record(5000, duplicate);
    expect(trace.at(5000)).toBe(duplicate);
    expect(trace.at(Infinity)).toBe(duplicate);
    trace.record(5001, []);
    expect(trace.at(0)).toBeNull();
    expect(trace.at(5000)).toBe(duplicate);
    expect(trace.at(NaN)).toBeNull();
  });

  it('matches copied histories across changing frame rates, long gaps, wraps and growth', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const trace = new AngleTrace();
      const previous = new CopiedTrace();
      let atMs = -1000;

      for (let i = 0; i < 1200; i++) {
        const gap = i % 311 === 0 ? 6000 : ((i * 17 + seed * 13) % 5) * 10;
        const angles: Angles = [Math.sin(i), i % 3 ? null : seed, -i];

        atMs += gap;
        Object.freeze(angles);
        trace.record(atMs, angles);
        previous.record(atMs, angles);

        if (i % 29 !== 0) continue;

        for (const offset of [-5001, -5000, -4999, -2500.5, -1, 0, 1]) {
          expect(trace.at(atMs + offset)).toBe(previous.at(atMs + offset));
        }
      }
    }
  });

  it('grows a wrapped history without changing samples or retaining them after clear', () => {
    const trace = new AngleTrace();
    const previous = new CopiedTrace();

    for (let i = 0; i < 200; i++) {
      const atMs = Math.min(i * 100, 6000);
      const angles: Angles = [i];

      trace.record(atMs, angles);
      previous.record(atMs, angles);
    }

    for (let ms = 0; ms <= 6100; ms += 50) expect(trace.at(ms)).toBe(previous.at(ms));

    trace.clear();
    expect(trace.at(Infinity)).toBeNull();
    trace.record(-500, [3]);
    expect(trace.at(-501)).toBeNull();
    expect(trace.at(-500)).toEqual([3]);
    trace.clear();
    trace.clear();
    expect(trace.at(0)).toBeNull();
  });

  it.each([
    { step: 20, frames: 3000, copiedEntries: 1379998 },
    { step: 10, frames: 6000, copiedEntries: 5509998 },
  ])('removes retained-array copies over $frames frames at $step ms intervals', ({ step, frames, copiedEntries }) => {
    const previous = new CopiedTrace();
    const trace = new AngleTrace();
    const angles: Angles = [1, null, -1];

    for (let i = 0; i < frames; i++) previous.record(i * step, angles);

    expect(previous.copiedEntries).toBe(copiedEntries);

    const slices = vi.spyOn(Array.prototype, 'slice');

    for (let i = 0; i < frames; i++) trace.record(i * step, angles);

    const sliceCount = slices.mock.calls.length;

    slices.mockRestore();
    expect(sliceCount).toBe(0);
    expect(trace.at((frames - 1) * step - 5000)).toBe(angles);
    expect(trace.at((frames - 1) * step - 5001)).toBeNull();
  });
});
