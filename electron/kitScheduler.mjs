import { PRIORITY } from './trainer.mjs';

const DEBOUNCE_MS = 5000;

export const kitWorkspace = (workspaceId) => `kit:${workspaceId}`;

export class KitScheduler {
  constructor({ trainer, debounceMs = DEBOUNCE_MS }) {
    this.trainer = trainer;
    this.debounceMs = debounceMs;
    this.timers = new Map();
    this.latest = new Map();
    this.generations = new Map();
    this.pending = new Map();
  }

  bump(workspaceId) {
    const generation = (this.generations.get(workspaceId) ?? 0) + 1;

    this.generations.set(workspaceId, generation);

    return generation;
  }

  settle(workspaceId, value) {
    const resolve = this.pending.get(workspaceId);

    this.pending.delete(workspaceId);
    resolve?.(value);
  }

  request({ workspaceId, xml, job }) {
    this.settle(workspaceId, { jobId: null });
    this.latest.set(workspaceId, { xml, job });
    this.bump(workspaceId);
    clearTimeout(this.timers.get(workspaceId));
    this.timers.set(
      workspaceId,
      setTimeout(() => this.flush(workspaceId), this.debounceMs),
    );

    return new Promise((resolve) => this.pending.set(workspaceId, resolve));
  }

  async flush(workspaceId) {
    this.timers.delete(workspaceId);

    const generation = this.generations.get(workspaceId);
    const key = kitWorkspace(workspaceId);

    await this.trainer.release(key);

    const latest = this.latest.get(workspaceId);

    if (this.generations.get(workspaceId) !== generation || !latest) return;

    this.latest.delete(workspaceId);
    this.settle(workspaceId, this.begin(key, latest));
  }

  begin(key, latest) {
    try {
      return this.trainer.start({ workspaceId: key, xml: latest.xml, job: latest.job, priority: PRIORITY.kit });
    } catch {
      return { jobId: null };
    }
  }

  cancel(workspaceId) {
    clearTimeout(this.timers.get(workspaceId));
    this.timers.delete(workspaceId);
    this.latest.delete(workspaceId);
    this.bump(workspaceId);
    this.settle(workspaceId, { jobId: null });

    return this.trainer.release(kitWorkspace(workspaceId));
  }

  dispose() {
    for (const workspaceId of [...this.timers.keys()]) {
      clearTimeout(this.timers.get(workspaceId));
      this.latest.delete(workspaceId);
      this.settle(workspaceId, { jobId: null });
    }

    this.timers.clear();
  }
}
