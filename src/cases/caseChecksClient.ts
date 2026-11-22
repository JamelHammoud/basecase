import type { CaseCheckJob, CaseCheckReply, WireRobot } from './caseCheckJob';
import { importedWorldItems } from './importedWorldItems';

const MAX_WORKERS = 4;
const IDLE_MS = 30000;

type Answer = { id: number; reply: CaseCheckReply } | { id: number; error: string };

export interface JobOptions {
  tag?: string;
  group?: string;
  robot?: () => WireRobot;
  first?: boolean;
}

interface Queued {
  id: number;
  job: CaseCheckJob;
  tag: string;
  group: string;
  robot?: () => WireRobot;
  resolve: (reply: CaseCheckReply) => void;
  reject: (error: Error) => void;
}

interface Slot {
  index: number;
  worker: WorkerLike;
  queue: Queued[];
  running: Queued | null;
  held: string | null;
}

export interface WorkerLike {
  onmessage: ((ev: MessageEvent<Answer>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  postMessage: (message: { id: number; job: CaseCheckJob }) => void;
  terminate: () => void;
}

export const caseWorkerCount = (cores: number | undefined) =>
  Math.max(1, Math.min(MAX_WORKERS, Math.floor((cores ?? 2) / 2)));

const spawnCaseWorker = () =>
  new Worker(new URL('./caseChecks.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike;

const cancellableJob = (job: CaseCheckJob, tag: string | undefined): CaseCheckJob =>
  job.type === 'runs' && tag && typeof SharedArrayBuffer !== 'undefined'
    ? { ...job, stopFlag: new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)) }
    : job;

export class CaseCheckPool {
  private slots = new Map<number, Slot>();
  private calls = 0;
  private disposed = false;
  private idle: ReturnType<typeof setTimeout> | null = null;

  private readonly spawn: () => WorkerLike;

  constructor(spawn: () => WorkerLike = spawnCaseWorker) {
    this.spawn = spawn;
  }

  get size() {
    return caseWorkerCount(globalThis.navigator?.hardwareConcurrency);
  }

  run<T extends CaseCheckReply['type']>(
    index: number,
    job: Extract<CaseCheckJob, { type: T }>,
    options: JobOptions = {},
  ): Promise<Extract<CaseCheckReply, { type: T }>> {
    if (this.disposed) return Promise.reject(new Error('Canceled'));

    if (this.idle) clearTimeout(this.idle);

    this.idle = null;

    const at = index % this.size;
    const slot = this.slot(at);

    return new Promise((resolve, reject) => {
      const queued: Queued = {
        id: ++this.calls,
        job: this.withWorld(cancellableJob(job, options.tag)),
        tag: options.tag ?? '',
        group: options.group ?? '',
        robot: options.robot,
        resolve: resolve as Queued['resolve'],
        reject,
      };

      if (options.first) slot.queue.unshift(queued);
      else slot.queue.push(queued);

      this.next(at);
    });
  }

  dispose() {
    this.disposed = true;
    this.failAll(new Error('Canceled'));
  }

  private withWorld(job: CaseCheckJob): CaseCheckJob {
    if (job.type !== 'runs' && job.type !== 'replay' && job.type !== 'record') return job;

    if (!job.kase.world?.imported || job.worldColliders) return job;

    return { ...job, worldColliders: importedWorldItems(job.kase.world.imported) };
  }

  keepOnly(tags: ReadonlySet<string>, group = '') {
    const replaced = new Error('A newer check replaced this one.');
    const stale = (q: Queued) => q.group === group && q.tag && !tags.has(q.tag);

    for (const slot of [...this.slots.values()]) {
      const dropped = slot.queue.filter(stale);

      slot.queue = slot.queue.filter((q) => !dropped.includes(q));

      for (const q of dropped) q.reject(replaced);

      if (slot.running && stale(slot.running)) this.cancelRunning(slot, replaced);
    }

    this.closeWhenIdle();
  }

  private cancelRunning(slot: Slot, error: Error) {
    const running = slot.running;

    if (running?.job.type === 'runs' && running.job.stopFlag) {
      Atomics.store(running.job.stopFlag, 0, 1);
      running.reject(error);

      return;
    }

    this.replaceSlot(slot, error);
  }

  private replaceSlot(slot: Slot, error: Error) {
    const pending = slot.queue;

    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    slot.worker.terminate();
    this.slots.delete(slot.index);
    slot.running?.reject(error);
    slot.running = null;
    slot.queue = [];

    if (!pending.length) return;

    this.slot(slot.index).queue = pending;
    this.next(slot.index);
  }

  private slot(index: number): Slot {
    const known = this.slots.get(index);

    if (known) return known;

    const worker = this.spawn();
    const slot: Slot = { index, worker, queue: [], running: null, held: null };

    worker.onmessage = (ev) => this.settle(slot, ev.data);
    worker.onerror = (e) => this.failAll(new Error(e.message || 'The Case checks stopped.'));
    this.slots.set(index, slot);

    return slot;
  }

  private withRobot(slot: Slot, queued: Queued): CaseCheckJob {
    const { job } = queued;

    if (
      job.type === 'model' ||
      job.type === 'multiply' ||
      job.type === 'workbench' ||
      job.type === 'workbench-identity' ||
      slot.held === job.modelHash
    )
      return job;

    slot.held = job.modelHash;

    return { ...job, robot: queued.robot?.() };
  }

  private next(index: number) {
    const slot = this.slots.get(index);

    if (!slot || slot.running) return;

    const queued = slot.queue.shift();

    if (!queued) {
      this.closeWhenIdle();

      return;
    }

    slot.running = queued;
    slot.worker.postMessage({ id: queued.id, job: this.withRobot(slot, queued) });
  }

  private settle(slot: Slot, answer: Answer) {
    const queued = slot.running;

    if (!queued || queued.id !== answer.id) return;

    slot.running = null;

    if ('error' in answer) slot.held = null;
    else if (answer.reply.type === 'model') slot.held = answer.reply.modelHash;

    if ('error' in answer) queued.reject(new Error(answer.error));
    else queued.resolve(answer.reply);

    if (this.slots.get(slot.index) === slot) this.next(slot.index);
  }

  private closeWhenIdle() {
    const busy = [...this.slots.values()].some((s) => s.running || s.queue.length);

    if (busy || this.idle || !this.slots.size) return;

    this.idle = setTimeout(() => this.close(), IDLE_MS);
  }

  private failAll(error: Error) {
    for (const slot of this.slots.values()) {
      for (const q of [slot.running, ...slot.queue]) q?.reject(error);
    }

    this.close();
  }

  private close() {
    if (this.idle) clearTimeout(this.idle);

    this.idle = null;

    for (const slot of this.slots.values()) slot.worker.terminate();

    this.slots.clear();
  }
}

export const caseCheckPool = new CaseCheckPool();
