import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Trainer, PRIORITY } from './trainer.mjs';
import { isCount, readJsonOrNull, RUN_ID } from './backend/trainingSnapshots.mjs';

const POLL_MS = 2000;
const RECOVERY_KEY = /^[a-zA-Z0-9:_-]{1,160}$/;
const digest = (request) =>
  createHash('sha256')
    .update(JSON.stringify([request.xml, request.job]))
    .digest('hex');
const journalFile = (entry) => path.join(entry.dir, 'remote-request.json');

function persist(entry) {
  const file = journalFile(entry);

  fs.writeFileSync(`${file}.tmp`, JSON.stringify(entry));
  fs.renameSync(`${file}.tmp`, file);
}

function savedEntries(jobsDir) {
  if (!fs.existsSync(jobsDir)) return [];

  return fs
    .readdirSync(jobsDir)
    .filter((id) => RUN_ID.test(id))
    .map((id) => {
      const dir = path.join(jobsDir, id);
      const saved = readJsonOrNull(journalFile({ dir }));

      return saved?.id === id ? { ...saved, dir } : null;
    })
    .filter(Boolean);
}

export class RemoteTrainer extends Trainer {
  constructor({ libraryDir, emit, remote, ...options }) {
    super(libraryDir, emit, options.spawn, options.forge);
    this.remote = remote;
    this.remoteRuns = new Map();
    this.remoteEntries = savedEntries(this.jobsDir);
    this.preparations = new Map();
    this.disposed = false;

    if (remote.available?.() === false) return;

    const descriptors = remote.descriptors();
    const pending = this.remoteEntries
      .filter((entry) => !entry.outcome)
      .sort((a, b) => Number(!!a.queued) - Number(!!b.queued));

    for (const entry of pending) {
      entry.remote = true;
      entry.descriptor ??= descriptors.find((descriptor) => descriptor.id === entry.id);
      this.enqueue(entry);
    }

    queueMicrotask(() => !this.disposed && this.launchNext());
  }

  status() {
    const local = super.status();

    return {
      ...local,
      ...(this.remote.selected() ? { uv: true, ready: true, engine: 'forge' } : {}),
      running: [...local.running, ...this.remoteRuns.keys()],
    };
  }

  start({ workspaceId = 'main', ...payload }) {
    const request = { ...payload, workspaceId };
    const { recoveryKey } = request;

    if (recoveryKey !== undefined && (typeof recoveryKey !== 'string' || !RECOVERY_KEY.test(recoveryKey)))
      throw new Error('The training recovery identity has the wrong format.');

    const existing =
      recoveryKey && this.remoteEntries.find((e) => e.recoveryKey === recoveryKey && e.workspaceId === workspaceId);

    if (existing && this.remote.available?.() === false)
      throw new Error('Secure storage is unavailable. Reopen the studio to connect.');

    if (existing) return this.reattach(existing, request);

    if (this.remoteRuns.has(workspaceId)) throw new Error('This scene is already training.');

    if (!this.remote.selected() || !recoveryKey || request.priority === PRIORITY.kit) return super.start(request);

    const entry = {
      ...this.prepare(request, true),
      recoveryKey,
      fingerprint: digest(request),
      dispatched: false,
      remote: true,
      queued: true,
    };

    persist(entry);
    this.remoteEntries.push(entry);
    this.prepareRemote(entry);
    this.yieldKit();
    this.place(entry);

    return { jobId: entry.id };
  }

  reattach(entry, request) {
    if (entry.fingerprint !== digest(request)) throw new Error('The design or training inputs changed. Train again.');

    const occupied = this.remoteRuns.get(entry.workspaceId);

    const sameWorkflow = entry.recoveryKey?.split(':')[0] === occupied?.entry.recoveryKey?.split(':')[0];

    if (occupied && occupied.entry.id !== entry.id && !(entry.outcome && sameWorkflow))
      throw new Error('This scene is already training.');

    if (entry.outcome) queueMicrotask(() => this.sender(entry)(entry.outcome));
    else if (!occupied && !this.queue.some((queued) => queued.id === entry.id)) this.place(entry);

    return { jobId: entry.id };
  }

  attach(entry) {
    const running = { entry, timer: null };

    entry.queued = false;
    persist(entry);
    this.remoteRuns.set(entry.workspaceId, running);
    this.sender(entry)({ kind: 'status', message: 'Connecting to training computer' });
    void this.connect(running);
  }

  async connect(running) {
    const { entry } = running;

    try {
      entry.descriptor ??= await (this.preparations.get(entry.id) ?? this.remote.prepare(entry));
      this.preparations.delete(entry.id);
      persist(entry);

      if (!entry.dispatched) {
        await this.remote.dispatch(entry.descriptor);
        entry.dispatched = true;
        persist(entry);
      }

      await this.pollRemote(running);
    } catch (error) {
      if (error.reconnect) this.sender(entry)({ kind: 'status', message: 'Waiting for the training computer' });
      else this.complete(running, { kind: 'error', message: error.message });
    }

    this.schedule(running);
  }

  schedule(running) {
    if (this.disposed || !this.remoteRuns.has(running.entry.workspaceId)) return;

    running.timer = setTimeout(() => {
      void this.connect(running);
    }, POLL_MS);
    running.timer.unref?.();
  }

  async pollRemote(running) {
    const { entry } = running;

    if (entry.stopping) await this.remote.stop(entry.descriptor);

    const result = await this.remote.poll(entry.descriptor);
    const send = this.sender(entry);

    for (const event of result.events) {
      if (event.type === 'progress') send({ kind: 'progress', progress: event });
      else if (event.type === 'status') send({ kind: 'status', message: String(event.message ?? '').slice(0, 1000) });
      else if (event.type === 'snapshot' && isCount(event.iteration) && isCount(event.steps))
        send({ kind: 'snapshot', iteration: event.iteration, steps: event.steps });
    }

    if (result.state === 'running') return;

    const done = result.state === 'done' && result.events.findLast((e) => e.type === 'done');
    const trustedDone = done && isCount(done.steps) && { steps: done.steps, stopped: done.stopped === true };
    const outcome = this.outcome(
      { ...entry, stopping: entry.stopping },
      { code: result.code, done: trustedDone, err: result.stderr },
    );

    this.complete(running, outcome);
  }

  complete({ entry }, outcome) {
    entry.outcome = outcome;
    persist(entry);

    if (entry.descriptor) this.remote.markCompleted(entry.descriptor);

    this.remoteRuns.delete(entry.workspaceId);
    this.wake(entry.workspaceId);
    this.sender(entry)(outcome);
    this.pruneRuns();
    queueMicrotask(() => !this.disposed && this.launchNext());
  }

  prepareRemote(entry) {
    const preparing = this.remote.prepare(entry).then((descriptor) => {
      entry.descriptor = descriptor;
      persist(entry);

      if (entry.outcome) this.remote.markCompleted(descriptor);

      return descriptor;
    });

    this.preparations.set(entry.id, preparing);
    void preparing.catch(() => {});
  }

  place(entry) {
    if (this.jobs.size || this.remoteRuns.size) {
      this.enqueue(entry);
      this.sender(entry)({ kind: 'status', message: this.waitingMessage() });

      return;
    }

    this.launch(entry);
  }

  waitingMessage() {
    const running = this.remoteRuns.values().next().value;

    return running ? `Queued. Starts after ${running.entry.job.name}.` : super.waitingMessage();
  }

  launch(entry) {
    if (this.remoteRuns.size) {
      this.enqueue(entry);
      this.sender(entry)({ kind: 'status', message: this.waitingMessage() });

      return;
    }

    if (entry.remote) this.attach(entry);
    else super.launch(entry);
  }

  launchNext() {
    if (!this.remoteRuns.size) super.launchNext();
  }

  stop(workspaceId = 'main') {
    const queued = this.queue.findIndex((entry) => entry.remote && entry.workspaceId === workspaceId);

    if (queued >= 0) {
      const [entry] = this.queue.splice(queued, 1);

      this.complete({ entry }, { kind: 'error', message: 'Training stopped.' });

      return { stopping: true };
    }

    const running = this.remoteRuns.get(workspaceId);

    if (!running) return super.stop(workspaceId);

    running.entry.stopping = true;
    persist(running.entry);

    if (running.entry.descriptor) void this.remote.stop(running.entry.descriptor).catch(() => {});

    return { stopping: true };
  }

  release(workspaceId) {
    if (this.queue.some((entry) => entry.remote && entry.workspaceId === workspaceId)) {
      this.stop(workspaceId);

      return Promise.resolve();
    }

    if (!this.remoteRuns.has(workspaceId)) return super.release(workspaceId);

    this.stop(workspaceId);

    return new Promise((resolve) => this.waiters.set(workspaceId, [...(this.waiters.get(workspaceId) ?? []), resolve]));
  }

  getPolicy(id) {
    const local = super.getPolicy(id);

    if (local || !RUN_ID.test(id) || !this.remoteEntries.some((e) => e.id === id)) return local;

    return readJsonOrNull(path.join(this.jobsDir, id, 'policy.json'));
  }

  pruneRuns() {
    const workflows = new Map();

    for (const entry of this.remoteEntries) {
      if (entry.recoveryKey) workflows.set(entry.workspaceId, entry.recoveryKey.split(':')[0]);
    }

    const active = new Set([
      ...[...this.jobs.values(), ...this.queue].map((entry) => entry.id),
      ...this.remoteEntries
        .filter((entry) => !entry.outcome || entry.recoveryKey?.startsWith(`${workflows.get(entry.workspaceId)}:`))
        .map((entry) => entry.id),
    ]);
    const removable = fs.existsSync(this.jobsDir)
      ? fs
          .readdirSync(this.jobsDir)
          .filter((id) => RUN_ID.test(id) && !active.has(id))
          .sort()
          .reverse()
      : [];

    for (const id of removable.slice(8)) fs.rmSync(path.join(this.jobsDir, id), { recursive: true, force: true });

    this.remoteEntries = this.remoteEntries.filter((entry) => fs.existsSync(entry.dir));
  }

  dispose() {
    this.disposed = true;

    for (const running of this.remoteRuns.values()) clearTimeout(running.timer);

    this.remoteRuns.clear();
    super.dispose();
  }
}
