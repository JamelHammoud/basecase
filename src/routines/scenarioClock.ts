export const ORDER = { world: 0, watcher: 1, reply: 2, coordinator: 3, control: 4 } as const;

interface Entry {
  t: number;
  order: number;
  seq: number;
  run: (t: number) => void;
}

const before = (a: Entry, b: Entry) => a.t - b.t || a.order - b.order || a.seq - b.seq;

export class VirtualClock {
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
