export class TimelineCursor<T> {
  private readonly entries: Array<T | undefined>;
  private readonly at: (entry: T) => number;
  private readonly visit: (entry: T) => void;
  private next = 0;
  private nextAt: number;

  constructor(entries: readonly T[], at: (entry: T) => number, visit: (entry: T) => void) {
    this.entries = [...entries].sort((a, b) => at(a) - at(b));
    this.at = at;
    this.visit = visit;
    this.nextAt = this.entries.length ? at(this.entries[0]!) : Infinity;
  }

  get remaining() {
    return this.entries.length - this.next;
  }

  advance(t: number) {
    while (this.next < this.entries.length && this.nextAt <= t + 1e-9) {
      const entry = this.entries[this.next]!;

      this.entries[this.next++] = undefined;
      this.nextAt = this.remaining ? this.at(this.entries[this.next]!) : Infinity;

      this.visit(entry);
    }

    if (this.remaining) return;

    this.entries.length = 0;
    this.next = 0;
  }
}
