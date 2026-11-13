import { caseWorkerCount } from './caseChecksClient';
import { multiplyBatch, type MultiplyJob, type Variation } from './multiply';

type Answer = { kept: Variation[] } | { error: string };

export interface MultiplyWorker {
  onmessage: ((ev: MessageEvent<Answer>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  postMessage: (message: { job?: MultiplyJob; seeds: number[] }) => void;
  terminate: () => void;
}

export interface MultiplyRun {
  done: Promise<void>;
  stop: () => void;
}

type OnKept = (kept: Variation[]) => void;

const spawnWorker = (): MultiplyWorker | null =>
  typeof Worker === 'undefined'
    ? null
    : (new Worker(new URL('./multiply.worker.ts', import.meta.url), { type: 'module' }) as MultiplyWorker);

function inPage(job: MultiplyJob, batches: number[][], onKept: OnKept): MultiplyRun {
  let stopped = false;
  const run = async () => {
    const { default: loadMujoco } = await import('@mujoco/mujoco');
    const mj = await loadMujoco();

    for (const seeds of batches) {
      if (stopped) return;

      onKept(await multiplyBatch(mj, job, seeds));
    }
  };

  return { done: run(), stop: () => (stopped = true) };
}

export function startMultiply(
  job: MultiplyJob,
  batches: number[][],
  options: { onKept: OnKept; spawn?: () => MultiplyWorker | null },
): MultiplyRun {
  const spawn = options.spawn ?? spawnWorker;
  const first = batches.length ? spawn() : null;

  if (batches.length && !first) return inPage(job, batches, options.onKept);

  const queue = [...batches];
  const workers: MultiplyWorker[] = [];
  let busy = 0;
  let stopped = false;
  let settle: { resolve: () => void; reject: (e: Error) => void } = { resolve: () => {}, reject: () => {} };
  const done = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));

  const end = (error?: Error) => {
    stopped = true;
    workers.forEach((w) => w.terminate());

    if (error) settle.reject(error);
    else settle.resolve();
  };

  const feed = (worker: MultiplyWorker, withJob: boolean) => {
    const seeds = queue.shift();

    if (!seeds) return busy ? undefined : end();

    busy++;
    worker.postMessage(withJob ? { job, seeds } : { seeds });
  };

  const answer = (worker: MultiplyWorker, reply: Answer) => {
    busy--;

    if (stopped) return;

    if ('error' in reply) return end(new Error(reply.error));

    options.onKept(reply.kept);
    feed(worker, false);
  };

  const count = Math.min(batches.length, caseWorkerCount(globalThis.navigator?.hardwareConcurrency));

  for (let i = 0; i < count; i++) {
    const worker = i === 0 ? first! : spawn()!;

    worker.onmessage = (ev) => answer(worker, ev.data);
    worker.onerror = (e) => end(new Error(e.message));
    workers.push(worker);
    feed(worker, true);
  }

  if (!count) end();

  return { done, stop: () => end() };
}
