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
  }

  bump(workspaceId) {
    const generation = (this.generations.get(workspaceId) ?? 0) + 1;

    this.generations.set(workspaceId, generation);

    return generation;
  }

  request({ workspaceId, xml, job }) {
    this.latest.set(workspaceId, { xml, job });
    this.bump(workspaceId);
    clearTimeout(this.timers.get(workspaceId));
    this.timers.set(
      workspaceId,
      setTimeout(() => this.flush(workspaceId), this.debounceMs),
    );
  }

  async flush(workspaceId) {
    this.timers.delete(workspaceId);

    const generation = this.generations.get(workspaceId);
    const key = kitWorkspace(workspaceId);

    await this.trainer.release(key);

    const latest = this.latest.get(workspaceId);

    if (this.generations.get(workspaceId) !== generation || !latest) return;

    this.latest.delete(workspaceId);
    this.trainer.start({ workspaceId: key, xml: latest.xml, job: latest.job, priority: PRIORITY.kit });
  }

  cancel(workspaceId) {
    clearTimeout(this.timers.get(workspaceId));
    this.timers.delete(workspaceId);
    this.latest.delete(workspaceId);
    this.bump(workspaceId);

    return this.trainer.release(kitWorkspace(workspaceId));
  }

  dispose() {
    for (const workspaceId of [...this.timers.keys()]) {
      clearTimeout(this.timers.get(workspaceId));
      this.latest.delete(workspaceId);
    }

    this.timers.clear();
  }
}
