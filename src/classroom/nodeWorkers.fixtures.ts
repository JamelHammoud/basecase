import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { build } from 'vite';
import type { CaseCheckJob } from '../cases/caseCheckJob';

const directory = new URL(`../../scratch/classroom-workers-${process.pid}/`, import.meta.url);
const output = fileURLToPath(directory);
const moduleUrl = new URL('pipelineWorker.fixtures.js', directory).href;
const workers = new Set<NodePipelineWorker>();
let peakWorkerBytes = 0;
let peakAggregateBytes = 0;
const memories = new Map<NodePipelineWorker, number>();
const terminating = new Set<Promise<number>>();

export async function buildClassroomWorkers() {
  await mkdir(output, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: fileURLToPath(new URL('./pipelineWorker.fixtures.ts', import.meta.url)),
      outDir: output,
      emptyOutDir: true,
      minify: false,
    },
  });
  await mkdir(new URL('assets/', directory), { recursive: true });
  await Promise.all(
    ['skills/contract.wasm', 'routines/coordinator.wasm'].flatMap((file) =>
      ['', 'assets/'].map((folder) =>
        copyFile(new URL(`../${file}`, import.meta.url), new URL(`${folder}${file.split('/').at(-1)}`, directory)),
      ),
    ),
  );
}

export class NodePipelineWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  jobs: CaseCheckJob[] = [];
  private worker: NodeWorker;

  constructor(url: URL | string) {
    const kind = String(url);
    const code = `
      const { parentPort } = require('node:worker_threads');
      const loading = import(${JSON.stringify(moduleUrl)}).then(m => m.pipelineHandlers(${JSON.stringify(kind)}));
      parentPort.on('message', async (message) => {
        try {
          const handlers = await loading;
          const response = message.job ? { result: await handlers.case(message.job) } : await handlers[message.op](message.payload);
          const result = message.job ? response.result.result : response.result;
          const memory = process.memoryUsage();
          parentPort.postMessage({ id: message.id, ...(message.job ? { reply: result } : { result }), memory: memory.heapUsed + memory.external });
        } catch (error) { parentPort.postMessage({ id: message.id, error: error.message }); }
      });
    `;

    this.worker = new NodeWorker(code, { eval: true });
    workers.add(this);
    this.worker.on('message', (data: { memory?: number }) => {
      peakWorkerBytes = Math.max(peakWorkerBytes, data.memory ?? 0);
      memories.set(this, data.memory ?? 0);
      peakAggregateBytes = Math.max(
        peakAggregateBytes,
        [...memories.values()].reduce((a, b) => a + b, 0),
      );
      this.onmessage?.({ data } as MessageEvent);
    });
    this.worker.on('error', (error) => this.onerror?.({ message: String(error) } as ErrorEvent));
  }

  postMessage(message: { job?: CaseCheckJob }, transfer: Transferable[] = []) {
    if (message.job) this.jobs.push(message.job);

    this.worker.postMessage(message, transfer as ArrayBuffer[]);
  }

  terminate() {
    this.terminated = true;
    workers.delete(this);
    memories.delete(this);

    const stopping = this.worker.terminate();

    terminating.add(stopping);
    void stopping.finally(() => terminating.delete(stopping));
  }
}

export function classroomWorkerMemory() {
  return {
    peakSampledWorkerBytes: peakWorkerBytes,
    peakSampledAggregateWorkerBytes: peakAggregateBytes,
    activeWorkers: workers.size,
    retainedBytes: process.memoryUsage().heapUsed + process.memoryUsage().external,
  };
}

export const settleClassroomWorkers = () => Promise.all([...terminating]);
export const resetClassroomMemory = () => {
  peakWorkerBytes = 0;
  peakAggregateBytes = 0;
};
