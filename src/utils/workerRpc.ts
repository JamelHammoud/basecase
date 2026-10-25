export interface Reply<R> {
  result: R;
  transfer?: Transferable[];
}

type Handler = (payload: never) => Promise<Reply<unknown>> | Reply<unknown>;

export type Handlers = Record<string, Handler>;

type PayloadOf<H extends Handlers, K extends keyof H> = Parameters<H[K]>[0];

type ResultOf<H extends Handlers, K extends keyof H> = Awaited<ReturnType<H[K]>>['result'];

interface Request {
  id: number;
  op: string;
  payload: unknown;
}

type Response = { id: number; result: unknown } | { id: number; error: string };

export const reply = <R>(result: R, transfer: Transferable[] = []): Reply<R> => ({ result, transfer });

export function serve(handlers: Handlers): void {
  const scope = self as unknown as {
    onmessage: ((e: MessageEvent<Request>) => void) | null;
    postMessage: (message: Response, transfer: Transferable[]) => void;
  };

  scope.onmessage = async ({ data }) => {
    try {
      const run = handlers[data.op] as (payload: unknown) => Promise<Reply<unknown>> | Reply<unknown>;
      const { result, transfer = [] } = await run(data.payload);

      scope.postMessage({ id: data.id, result }, transfer);
    } catch (error) {
      scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }, []);
    }
  };
}

class WorkerUnavailable extends Error {}

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface WorkerClient<H extends Handlers> {
  call: <K extends keyof H & string>(
    op: K,
    payload: PayloadOf<H, K>,
    transfer?: Transferable[],
  ) => Promise<ResultOf<H, K>>;
  dispose: () => void;
}

export function workerClient<H extends Handlers>(spawn: () => Worker, local: () => Promise<H>): WorkerClient<H> {
  const waiting = new Map<number, Waiter>();
  let worker: Worker | null = null;
  let broken = typeof Worker === 'undefined';
  let next = 1;

  const failAll = (message: string) => {
    broken = true;
    worker?.terminate();
    worker = null;
    waiting.forEach((w) => w.reject(new WorkerUnavailable(message)));
    waiting.clear();
  };

  const ensure = () => {
    if (broken || worker) return worker;

    try {
      worker = spawn();
    } catch {
      broken = true;

      return null;
    }

    worker.onmessage = ({ data }: MessageEvent<Response>) => {
      const waiter = waiting.get(data.id);

      waiting.delete(data.id);

      if ('error' in data) waiter?.reject(new Error(data.error));
      else waiter?.resolve(data.result);
    };
    worker.onerror = (e) => failAll(e.message || 'Worker failed');

    return worker;
  };

  const runLocal = async (op: string, payload: unknown) => {
    const handlers = await local();
    const run = handlers[op] as (payload: unknown) => Promise<Reply<unknown>> | Reply<unknown>;

    return (await run(payload)).result;
  };

  const call = (op: string, payload: unknown, transfer: Transferable[] = []) => {
    const target = ensure();

    if (!target) return runLocal(op, payload);

    const id = next++;
    const sent = new Promise<unknown>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      target.postMessage({ id, op, payload } satisfies Request, transfer);
    });

    return sent.catch((error: unknown) =>
      error instanceof WorkerUnavailable ? runLocal(op, payload) : Promise.reject(error),
    );
  };

  return {
    call: call as WorkerClient<H>['call'],
    dispose: () => failAll('Worker stopped'),
  };
}
