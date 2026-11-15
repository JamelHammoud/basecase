export class StartupLease {
  private generation = 0;
  private release: (() => void) | null = null;

  claim(): number {
    this.cancel();

    return this.generation;
  }

  claimAfter(setup: () => void): number {
    setup();

    return this.claim();
  }

  current(ticket: number): boolean {
    return ticket === this.generation;
  }

  retain(ticket: number, release: () => void): boolean {
    if (!this.current(ticket)) {
      release();

      return false;
    }

    this.release?.();
    this.release = release;

    return true;
  }

  finish(ticket: number) {
    if (this.current(ticket)) this.cancel();
  }

  cancel() {
    this.generation++;

    const release = this.release;

    this.release = null;
    release?.();
  }
}
