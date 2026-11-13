interface Timer {
  due: number;
  every: number;
  run: () => void;
}

export interface Stall {
  atMs: number;
  forMs: number;
}

const settle = async () => {
  for (let turn = 0; turn < 16; turn++) await Promise.resolve();
};

export class FakeEventLoop {
  now = 0;
  private readonly timers = new Map<number, Timer>();
  private nextId = 1;
  private stalls: Stall[] = [];

  readonly setInterval = (run: () => void, ms: number) => this.add(run, ms);
  readonly clearTimer = (id: number | undefined) => void this.timers.delete(id ?? 0);

  stallAfter(stalls: Stall[]) {
    this.stalls = stalls.map((s) => ({ atMs: this.now + s.atMs, forMs: s.forMs })).sort((a, b) => a.atMs - b.atMs);
  }

  async runFor(ms: number) {
    const until = this.now + ms;

    for (let timer = this.earliest(); timer && timer.due <= until; timer = this.earliest()) {
      if (this.stallBefore(timer.due)) continue;

      this.now = Math.max(this.now, timer.due);
      this.reschedule(timer);
      timer.run();
      await settle();
    }

    this.now = until;
  }

  private stallBefore(due: number) {
    const stall = this.stalls[0];

    if (!stall || stall.atMs > due) return false;

    this.stalls.shift();
    this.now = Math.max(this.now, stall.atMs) + stall.forMs;

    return true;
  }

  private reschedule(timer: Timer) {
    const onTime = timer.due + timer.every;

    timer.due = onTime > this.now ? onTime : this.now + timer.every;
  }

  private add(run: () => void, every: number) {
    const id = this.nextId++;

    this.timers.set(id, { due: this.now + every, every, run });

    return id;
  }

  private earliest() {
    let best: Timer | null = null;

    for (const timer of this.timers.values()) if (!best || timer.due < best.due) best = timer;

    return best;
  }
}
