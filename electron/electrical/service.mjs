import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { boundedRouteRequest } from './route.mjs';
import { boundedBoardRequest } from './inputs.mjs';

export class ElectricalBoards {
  jobs = new Map();
  cancelled = new Set();

  async tools() {
    return this.run({ id: crypto.randomUUID() }, 'tools');
  }

  async validate(request) {
    boundedBoardRequest(request);

    return this.run(request, 'validate');
  }

  async route(input) {
    boundedRouteRequest(input);
    boundedBoardRequest(input.request);

    return this.run(input, 'route');
  }

  async run(input, mode) {
    const request = mode === 'route' ? input.request : input;

    if (this.cancelled.delete(request.id)) throw new Error('board-validation');

    if (this.jobs.size >= 2 || this.jobs.has(request.id)) throw new Error('board-validation');

    const job = { worker: null, cancelled: false };
    let directory;

    this.jobs.set(request.id, job);

    try {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), 'basecase-pcb-job-'));
      job.worker = new Worker(new URL('./worker.mjs', import.meta.url), {
        workerData: { request: input, mode, directory },
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      });

      if (job.cancelled) job.worker.postMessage('cancel');

      return await workerResult(job.worker);
    } finally {
      this.jobs.delete(request.id);

      if (directory) await fs.rm(directory, { recursive: true, force: true });
    }
  }

  cancel(id) {
    if (typeof id !== 'string' || id.length > 80) throw new Error('board-format');

    this.cancelled.add(id);

    if (this.cancelled.size > 128) this.cancelled.delete(this.cancelled.values().next().value);

    const job = this.jobs.get(id);

    if (job) job.cancelled = true;

    job?.worker?.postMessage('cancel');

    return { ok: true };
  }
}

function workerResult(worker) {
  return new Promise((resolve, reject) => {
    let reply;
    let failure;

    worker.on('message', (value) => {
      reply = value;
    });
    worker.on('error', (error) => {
      failure = error;
    });
    worker.on('exit', () => {
      if (failure || !reply || reply.error) return reject(failure ?? new Error(reply?.error ?? 'board-validation'));

      resolve(reply.result);
    });
  });
}
