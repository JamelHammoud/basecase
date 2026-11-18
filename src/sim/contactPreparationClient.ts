import type { MjcfInput, SimModel } from './mjcfTypes';
import type { ContactHullEntry, ContactPreparationJob, ContactPreparationResult } from './contactPreparation';

const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const cache = new Map<string, ContactHullEntry>();

export function contactJob(input: MjcfInput): ContactPreparationJob {
  const { partTriangles, worldTriangles, ...data } = input;
  const parts = [...input.parts, ...(input.world ?? [])];
  const triangles: Record<string, Float32Array> = {};

  for (const part of parts) {
    const values = partTriangles(part.id) ?? worldTriangles?.(part.id);

    if (values) triangles[part.id] = values.slice();
  }

  return { input: data, triangles, cache: [...cache.values()] };
}

interface PreparationOptions {
  signal?: AbortSignal;
  current?: () => boolean;
}

function assertCurrent(options: PreparationOptions) {
  options.signal?.throwIfAborted();

  if (options.current && !options.current()) throw new DOMException('Simulation preparation changed.', 'AbortError');
}

function remember(entries: ContactHullEntry[]) {
  for (const entry of entries) {
    cache.delete(entry.hash);
    cache.set(entry.hash, entry);
  }

  let bytes = [...cache.values()].reduce(
    (total, entry) => total + entry.hulls.reduce((sum, hull) => sum + hull.byteLength, 0),
    0,
  );

  for (const [hash, entry] of cache) {
    if (bytes <= MAX_CACHE_BYTES) break;

    cache.delete(hash);
    bytes -= entry.hulls.reduce((sum, hull) => sum + hull.byteLength, 0);
  }
}

async function prepareInWorker(job: ContactPreparationJob, signal?: AbortSignal): Promise<ContactPreparationResult> {
  const worker = new Worker(new URL('./contactPreparation.worker.ts', import.meta.url), { type: 'module' });

  try {
    return await new Promise((resolve, reject) => {
      const abort = () => reject(signal?.reason ?? new DOMException('Simulation preparation stopped.', 'AbortError'));
      const cleanup = () => signal?.removeEventListener('abort', abort);

      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{ result?: ContactPreparationResult; error?: string }>) => {
        cleanup();

        if (data.result) resolve(data.result);
        else reject(new Error(data.error));
      };
      worker.onerror = (event) => {
        cleanup();
        reject(new Error(event.message));
      };
      worker.postMessage(
        job,
        Object.values(job.triangles).map((triangles) => triangles.buffer),
      );

      if (signal?.aborted) abort();
    });
  } finally {
    worker.terminate();
  }
}

export async function prepareContactModel(input: MjcfInput, options: PreparationOptions = {}): Promise<SimModel> {
  assertCurrent(options);

  const job = contactJob(input);
  const result =
    typeof Worker === 'undefined' && typeof window === 'undefined'
      ? await (await import('./contactPreparation')).prepareContactJob(job)
      : await prepareInWorker(job, options.signal);

  assertCurrent(options);
  remember(result.cache);

  return result.model;
}
