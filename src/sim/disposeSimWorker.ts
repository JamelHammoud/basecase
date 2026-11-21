import type { SimRequest, SimResponse } from './simMessages';

export function disposeSimWorker(worker: Worker | null) {
  if (!worker) return;

  const disposed = (event: MessageEvent<SimResponse>) => {
    if (event.data.type !== 'disposed') return;

    worker.removeEventListener('message', disposed);
    worker.terminate();
  };

  worker.addEventListener('message', disposed);
  worker.addEventListener('error', () => worker.terminate(), { once: true });
  worker.postMessage({ type: 'dispose' } satisfies SimRequest);
}
