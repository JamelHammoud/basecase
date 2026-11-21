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
    let at = this.entries.length;

    this.entries.push(entry);

    while (at > 0) {
      const parent = (at - 1) >> 1;

      if (before(this.entries[parent], entry) <= 0) break;

      this.entries[at] = this.entries[parent];
      at = parent;
    }

    this.entries[at] = entry;
  }

  private take(): Entry {
    const next = this.entries[0];
    const last = this.entries.pop()!;

    if (!this.entries.length) return next;

    let at = 0;

    while (at * 2 + 1 < this.entries.length) {
      const left = at * 2 + 1;
      const right = left + 1;
      const child = right < this.entries.length && before(this.entries[right], this.entries[left]) < 0 ? right : left;

      if (before(last, this.entries[child]) <= 0) break;

      this.entries[at] = this.entries[child];
      at = child;
    }

    this.entries[at] = last;

    return next;
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
      const next = this.take();

      this.now = next.t;
      next.run(next.t);
    }
  }
}
