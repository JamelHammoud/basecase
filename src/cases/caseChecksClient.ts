import type { CaseCheckJob, CaseCheckReply } from './caseCheckJob';

const MAX_WORKERS = 4;
const IDLE_MS = 30000;

interface Pending {
  resolve: (reply: CaseCheckReply) => void;
  reject: (error: Error) => void;
}

type Answer = { id: number; reply: CaseCheckReply } | { id: number; error: string };

export const caseWorkerCount = (cores: number | undefined) =>
  Math.max(1, Math.min(MAX_WORKERS, Math.floor((cores ?? 2) / 2)));

class CaseCheckPool {
  private workers: Worker[] = [];
  private pending = new Map<number, Pending>();
  private calls = 0;
  private busy = 0;
  private idle: ReturnType<typeof setTimeout> | null = null;

  get size() {
    return caseWorkerCount(globalThis.navigator?.hardwareConcurrency);
  }

  private worker(index: number): Worker {
    this.workers[index] ??= this.spawn();

    return this.workers[index];
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./caseChecks.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (ev: MessageEvent<Answer>) => this.settle(ev.data);
    worker.onerror = (e) => this.failAll(new Error(e.message || 'The Case checks stopped.'));

    return worker;
  }

  private settle(answer: Answer) {
    const waiting = this.pending.get(answer.id);

    this.pending.delete(answer.id);

    if ('error' in answer) waiting?.reject(new Error(answer.error));
    else waiting?.resolve(answer.reply);
  }

  private failAll(error: Error) {
    for (const waiting of this.pending.values()) waiting.reject(error);

    this.pending.clear();
    this.close();
  }

  private close() {
    for (const worker of this.workers) worker?.terminate();

    this.workers = [];
  }

  async run<T extends CaseCheckReply['type']>(index: number, job: Extract<CaseCheckJob, { type: T }>) {
    if (this.idle) clearTimeout(this.idle);

    this.busy++;

    try {
      const id = ++this.calls;
      const reply = await new Promise<CaseCheckReply>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker(index % this.size).postMessage({ id, job });
      });

      return reply as Extract<CaseCheckReply, { type: T }>;
    } finally {
      this.busy--;

      if (!this.busy) this.idle = setTimeout(() => this.close(), IDLE_MS);
    }
  }
}

export const caseCheckPool = new CaseCheckPool();
