import type { RoutinesRequest, RoutinesResponse } from './routines.worker';

type Reply<K extends RoutinesResponse['type']> = Extract<RoutinesResponse, { type: K }>;

export function inRoutinesWorker<K extends RoutinesRequest['type']>(
  request: Extract<RoutinesRequest, { type: K }>,
): Promise<Reply<K>> {
  const worker = new Worker(new URL('./routines.worker.ts', import.meta.url), { type: 'module' });

  return new Promise<Reply<K>>((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent<RoutinesResponse>) => {
      if (ev.data.type === 'error') reject(new Error(ev.data.message));
      else resolve(ev.data as Reply<K>);
    };
    worker.onerror = (e) => reject(new Error(e.message || 'The Routine checker stopped.'));
    worker.postMessage(request);
  }).finally(() => worker.terminate());
}
