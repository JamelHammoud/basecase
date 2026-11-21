import type { ComparisonJobs } from './comparisonJobs';

type Result<K extends keyof ComparisonJobs> = Awaited<ReturnType<ComparisonJobs[K]>>['result'];

type Payload<K extends keyof ComparisonJobs> = Parameters<ComparisonJobs[K]>[0];

interface Request {
  id: number;
  op: keyof ComparisonJobs;
  payload: Payload<keyof ComparisonJobs>;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface ComparisonConsumer {
  call: <K extends keyof ComparisonJobs>(operation: K, payload: Payload<K>) => Promise<Result<K>>;
  dispose: () => void;
}

export function comparisonConsumer(): ComparisonConsumer {
  const worker = new Worker(new URL('./comparison.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Request>();
  const queued = new Map<keyof ComparisonJobs, Request>();
  let sequence = 0;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;

    disposed = true;
    worker.terminate();
    pending.forEach(({ reject }) => reject(new DOMException('', 'AbortError')));
    queued.forEach(({ reject }) => reject(new DOMException('', 'AbortError')));
    pending.clear();
    queued.clear();
  };
  const dispatch = (request: Request) => {
    pending.set(request.id, request);

    const { id, op, payload } = request;
    const bytes = 'bytes' in payload ? payload.bytes : null;

    worker.postMessage({ id, op, payload }, bytes ? [bytes.buffer] : []);
  };

  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);

    if (!request) {
      data.result?.bitmap?.close();

      return;
    }

    pending.delete(data.id);

    if ('error' in data) request?.reject(new Error(data.error));
    else request?.resolve(data.result);

    const next = request && queued.get(request.op);

    if (!next || disposed) return;

    queued.delete(next.op);
    dispatch(next);
  };
  worker.onerror = () => {
    pending.forEach(({ reject }) => reject(new Error('Open the try again.')));
    dispose();
  };

  return {
    dispose,
    call: ((op: keyof ComparisonJobs, payload: Payload<keyof ComparisonJobs>) => {
      if (disposed) return Promise.reject(new DOMException('', 'AbortError'));

      const id = ++sequence;

      return new Promise<unknown>((resolve, reject) => {
        const request = { id, op, payload, resolve, reject };

        if (![...pending.values()].some((sent) => sent.op === op)) return dispatch(request);

        queued.get(op)?.reject(new DOMException('', 'AbortError'));
        queued.set(op, request);
      });
    }) as ComparisonConsumer['call'],
  };
}
