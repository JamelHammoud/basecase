const STOPPED_ERROR =
  'The CAD kernel stopped (time or memory limit). Simplify the part (fewer booleans, lower $fn, fewer hull() pieces).';
const CLOSED_ERROR = 'The CAD kernel closed with the app window.';
const BAD_RESULT_ERROR = 'The CAD kernel sent a bad result, so it was stopped.';

const timeoutError = (timeoutMs) =>
  `Rendering took longer than ${Math.round(timeoutMs / 1000)} s. Simplify the part (fewer booleans, lower $fn, fewer hull() pieces).`;

export const startError = (reason) =>
  `The CAD kernel sandbox couldn’t start: ${reason}. Restart Basecase. Parts can’t compile until it starts.`;

export const MAX_RESULT_BYTES = 64_000_000;

const encode = (result) => Buffer.from(JSON.stringify(result));

const stoppedOutcome = (slot) => encode({ ok: false, error: slot.running?.messages.stopped ?? STOPPED_ERROR });

const GETTING_READY = new Set(['starting', 'restarting']);

export class KernelPool {
  constructor({ openSlot, size, memoryLimitBytes, memoryOf, startMs = 30000, idleMs = 600000, pollMs = 500 }) {
    Object.assign(this, { openSlot, size, memoryLimitBytes, memoryOf, startMs, idleMs, pollMs });
    this.slots = [];
    this.waiting = [];
    this.nextId = 1;
    this.watch = null;
  }

  submit(job, timeoutMs, messages = {}) {
    return new Promise((resolve) => {
      this.waiting.push({ job: { ...job, id: this.nextId++ }, timeoutMs, messages, resolve });
      this.pump();
    });
  }

  warm() {
    if (!this.slots.length) this.open();
  }

  stop() {
    for (const job of this.waiting.splice(0)) job.resolve(encode({ ok: false, error: CLOSED_ERROR }));

    for (const slot of [...this.slots]) this.retire(slot, encode({ ok: false, error: CLOSED_ERROR }));
  }

  pump() {
    for (let idle = this.idleSlot(); idle && this.waiting.length; idle = this.idleSlot()) {
      this.assign(idle, this.waiting.shift());
    }

    while (this.slots.length < this.size && this.gettingReady() < this.waiting.length) this.open();
  }

  idleSlot() {
    return this.slots.find((s) => s.state === 'idle');
  }

  gettingReady() {
    return this.slots.filter((s) => GETTING_READY.has(s.state)).length;
  }

  open() {
    const slot = { state: 'starting', running: null, timer: null, idleTimer: null, channel: null };

    this.slots.push(slot);
    slot.timer = setTimeout(() => this.failStart(slot, 'it took too long'), this.startMs);

    try {
      slot.channel = this.openSlot({
        onReady: () => this.onReady(slot),
        onResult: (id, bytes) => this.onResult(slot, id, bytes),
        onFailed: (reason) => this.onFailed(slot, reason),
        onGone: (reason) => this.onFailed(slot, reason),
      });
    } catch (err) {
      this.failStart(slot, err?.message ?? err);
    }

    return slot;
  }

  onReady(slot) {
    if (!this.slots.includes(slot)) return;

    clearTimeout(slot.timer);
    slot.state = 'idle';
    this.noteIdle(slot);
    this.pump();
  }

  assign(slot, entry) {
    clearTimeout(slot.idleTimer);
    slot.state = 'busy';
    slot.running = entry;
    slot.timer = setTimeout(
      () => this.retire(slot, encode({ ok: false, error: entry.messages.timeout ?? timeoutError(entry.timeoutMs) })),
      entry.timeoutMs,
    );
    slot.channel.run(entry.job);
    this.startWatching();
  }

  onResult(slot, id, bytes) {
    const entry = slot.running;

    if (!entry || entry.job.id !== id) return;

    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_RESULT_BYTES) {
      this.retire(slot, encode({ ok: false, error: BAD_RESULT_ERROR }));

      return;
    }

    clearTimeout(slot.timer);
    slot.running = null;
    slot.state = entry.job.language === 'replicad' ? 'restarting' : 'idle';
    entry.resolve(bytes);
    this.stopWatchingIfIdle();

    if (slot.state === 'idle') this.noteIdle(slot);
    else slot.timer = setTimeout(() => this.retire(slot), this.startMs);

    this.pump();
  }

  onFailed(slot, reason) {
    if (!this.slots.includes(slot)) return;

    if (slot.state === 'starting') this.failStart(slot, reason);
    else this.retire(slot, stoppedOutcome(slot));
  }

  failStart(slot, reason) {
    const error = encode({ ok: false, error: startError(reason) });
    const entry = this.waiting.shift();

    entry?.resolve(error);
    this.retire(slot, error);
  }

  retire(slot, outcome) {
    const entry = slot.running;

    clearTimeout(slot.timer);
    clearTimeout(slot.idleTimer);
    this.slots = this.slots.filter((s) => s !== slot);
    slot.running = null;
    slot.state = 'dead';

    try {
      slot.channel?.kill();
    } catch {}

    entry?.resolve(outcome);
    this.stopWatchingIfIdle();
    this.pump();
  }

  noteIdle(slot) {
    clearTimeout(slot.idleTimer);
    slot.idleTimer = setTimeout(() => this.closeIfIdle(slot), this.idleMs);
    slot.idleTimer.unref?.();
  }

  closeIfIdle(slot) {
    if (slot.state === 'idle') this.retire(slot);
  }

  startWatching() {
    if (this.watch) return;

    this.watch = setInterval(() => this.checkMemory(), this.pollMs);
    this.watch.unref?.();
  }

  stopWatchingIfIdle() {
    if (!this.watch || this.slots.some((s) => s.running)) return;

    clearInterval(this.watch);
    this.watch = null;
  }

  checkMemory() {
    for (const slot of this.slots.filter((s) => s.running)) {
      const used = this.memoryOf(slot.channel.pid());

      if (used > this.memoryLimitBytes) this.retire(slot, stoppedOutcome(slot));
    }
  }
}
