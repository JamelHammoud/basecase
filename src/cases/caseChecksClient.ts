import type { CaseCheckJob, CaseCheckReply, WireRobot } from './caseCheckJob';

const MAX_WORKERS = 4;
const IDLE_MS = 30000;

type Answer = { id: number; reply: CaseCheckReply } | { id: number; error: string };

export interface JobOptions {
  tag?: string;
  robot?: () => WireRobot;
  first?: boolean;
}

interface Queued {
  id: number;
  job: CaseCheckJob;
  tag: string;
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

export class CaseCheckPool {
  private slots = new Map<number, Slot>();
  private calls = 0;
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
    if (this.idle) clearTimeout(this.idle);

    this.idle = null;

    const at = index % this.size;
    const slot = this.slot(at);

    return new Promise((resolve, reject) => {
      const queued: Queued = {
        id: ++this.calls,
        job,
        tag: options.tag ?? '',
        robot: options.robot,
        resolve: resolve as Queued['resolve'],
        reject,
      };

      if (options.first) slot.queue.unshift(queued);
      else slot.queue.push(queued);

      this.next(at);
    });
  }

  keepOnly(tags: ReadonlySet<string>) {
    for (const slot of this.slots.values()) {
      const dropped = slot.queue.filter((q) => q.tag && !tags.has(q.tag));

      slot.queue = slot.queue.filter((q) => !dropped.includes(q));

      for (const q of dropped) q.reject(new Error('A newer check replaced this one.'));
    }
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

    if (job.type === 'model' || job.type === 'multiply' || slot.held === job.modelHash) return job;

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

    if (!busy) this.idle = setTimeout(() => this.close(), IDLE_MS);
  }

  private failAll(error: Error) {
    for (const slot of this.slots.values()) {
      for (const q of [slot.running, ...slot.queue]) q?.reject(error);
    }

    this.close();
  }

  private close() {
    for (const slot of this.slots.values()) slot.worker.terminate();

    this.slots.clear();
  }
}

export const caseCheckPool = new CaseCheckPool();

export const multiplyPool = new CaseCheckPool();
