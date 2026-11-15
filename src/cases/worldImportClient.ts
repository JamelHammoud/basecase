import type { PreparedWorld, WorldImportRequest } from './worldImportOps';

export type { PreparedWorld, WorldImportRequest } from './worldImportOps';

export function importWorldInWorker(request: WorldImportRequest, signal?: AbortSignal): Promise<PreparedWorld> {
  if (signal?.aborted) return Promise.reject(new Error('World import stopped.'));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worldImport.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
    };
    const abort = () => {
      finish();
      reject(new Error('World import stopped.'));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('World import exceeded 30 seconds.'));
    }, 30_000);

    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ result: PreparedWorld } | { error: string }>) => {
      finish();

      if ('error' in data) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'World import worker stopped.'));
    };

    try {
      worker.postMessage({ id: 1, op: 'importWorld', payload: request }, [
        ...new Set(request.files.map((file) => file.bytes.buffer).filter((buffer) => buffer instanceof ArrayBuffer)),
      ]);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
