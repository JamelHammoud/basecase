export class TimelineCursor<T> {
  private readonly entries: Array<T | undefined>;
  private readonly at: (entry: T) => number;
  private readonly visit: (entry: T) => void;
  private next = 0;

  constructor(entries: readonly T[], at: (entry: T) => number, visit: (entry: T) => void) {
    this.entries = [...entries].sort((a, b) => at(a) - at(b));
    this.at = at;
    this.visit = visit;
  }

  get remaining() {
    return this.entries.length - this.next;
  }

  advance(t: number) {
    while (this.next < this.entries.length && this.at(this.entries[this.next]!) <= t + 1e-9) {
      const entry = this.entries[this.next]!;

      this.entries[this.next++] = undefined;

      this.visit(entry);
    }

    if (this.remaining) return;

    this.entries.length = 0;
    this.next = 0;
  }
}
