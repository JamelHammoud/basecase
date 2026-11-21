import { describe, expect, it } from 'vitest';
import { ORDER, VirtualClock } from './scenarioClock';

interface Entry {
  t: number;
  order: number;
  seq: number;
  run: (t: number) => void;
}

const before = (a: Entry, b: Entry) => a.t - b.t || a.order - b.order || a.seq - b.seq;

class SortedClock {
  private entries: Entry[] = [];
  private seq = 0;
  now = 0;

  at(t: number, order: number, run: (t: number) => void) {
    const entry = { t, order, seq: this.seq++, run };
    let lo = 0;
    let hi = this.entries.length;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (before(this.entries[mid], entry) < 0) lo = mid + 1;
      else hi = mid;
    }

    this.entries.splice(lo, 0, entry);
  }

  every(periodMs: number, order: number, run: (t: number) => void) {
    let k = 0;
    const step = (t: number) => {
      run(t);
      k += 1;
      this.at(k * periodMs, order, step);
    };

    this.at(0, order, step);
  }

  runUntil(endMs: number) {
    while (this.entries.length && this.entries[0].t <= endMs) {
      const next = this.entries.shift() as Entry;

      this.now = next.t;
      next.run(next.t);
    }
  }
}

function replay(clock: VirtualClock | SortedClock) {
  const trace: number[][] = [];
  const record = (id: number, t: number) => trace.push([id, t, clock.now]);

  for (let id = 0; id < 2048; id++) {
    const t = (id * 79) % 307;
    const order = id % 5;

    clock.at(t, order, (now) => {
      record(id, now);
      clock.at(now, (order + 1) % 5, (at) => record(id + 2048, at));
      clock.at(now + 13, order, (at) => record(id + 4096, at));
    });
  }

  clock.every(20, ORDER.control, (t) => record(-1, t));
  clock.every(50, ORDER.coordinator, (t) => record(-2, t));
  clock.every(100, ORDER.watcher, (t) => record(-3, t));

  for (const end of [-1, 0, 1, 20, 100, 100, 101, 306, 320, 500]) clock.runUntil(end);

  return trace;
}

describe('scenario clock', () => {
  it('matches sorted scheduling through ties, callback insertions, recurring ticks and partial runs', () => {
    expect(replay(new VirtualClock())).toEqual(replay(new SortedClock()));
  });

  it('drains singleton queues and resumes after a callback throws', () => {
    const clock = new VirtualClock();
    const trace: number[] = [];

    clock.runUntil(100);
    expect(clock.now).toBe(0);
    clock.at(1, ORDER.world, () => {
      throw new Error('stopped callback');
    });
    expect(() => clock.runUntil(1)).toThrow('stopped callback');
    clock.at(2, ORDER.reply, (t) => trace.push(t));
    clock.runUntil(1);
    expect(trace).toEqual([]);
    clock.runUntil(2);
    expect(trace).toEqual([2]);
    clock.runUntil(3);
    expect(clock.now).toBe(2);
  });
});
