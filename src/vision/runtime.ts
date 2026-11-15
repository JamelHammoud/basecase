import type { VisionManifest } from './manifest';
import { validateVisionManifest } from './manifest';
import { hubBridge } from '../hub/hubBridge';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { VisionFrameOptions, VisionPixels, VisionResult } from './types';

export interface VisionRuntimeError {
  camera?: string;
  modelId?: string;
  timestamp?: number;
  error: string;
}

interface PendingRequest {
  resolve(value: unknown): void;

  reject(error: Error): void;
}

interface RuntimeInbox {
  listeners: Set<(result: VisionResult) => void>;
  errors: Set<(error: VisionRuntimeError) => void>;
  pending: Map<number, PendingRequest>;
}

type WorkerMessage =
  | { type: 'result'; result: VisionResult }
  | ({ type: 'error' } & VisionRuntimeError)
  | { type: 'reply'; id: number; result?: unknown; error?: string };

function deliver(message: WorkerMessage, inbox: RuntimeInbox) {
  if (message.type === 'result') {
    inbox.listeners.forEach((listen) => listen(message.result));

    return;
  }

  if (message.type === 'error') {
    inbox.errors.forEach((listen) => listen(message));

    return;
  }

  const request = inbox.pending.get(message.id);

  inbox.pending.delete(message.id);

  if (message.error) request?.reject(new Error(message.error));
  else request?.resolve(message.result);
}

async function untilStopped<T>(operation: Promise<T>, ending: Promise<Error>) {
  return Promise.race([
    operation,
    ending.then((error) => {
      throw error;
    }),
  ]);
}

async function loadPayload(manifest: VisionManifest, supplied?: Uint8Array) {
  const bytes = supplied ? new Uint8Array(supplied) : undefined;
  const source = !bytes && !IS_WEB_DEMO ? (await hubBridge.modelFile(manifest.model)).url : undefined;

  if (!bytes && !IS_WEB_DEMO && typeof source !== 'string')
    throw new Error('The model cache address must stay inside Basecase.');

  return { bytes, source };
}

export function createVisionRuntime() {
  const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
  const listeners = new Set<(result: VisionResult) => void>();
  const errors = new Set<(error: VisionRuntimeError) => void>();
  const pending = new Map<number, PendingRequest>();
  const inbox = { listeners, errors, pending };
  const loading = new Map<string, number>();
  let sequence = 0;
  let closed = false;
  let end: (error: Error) => void;
  const ending = new Promise<Error>((resolve) => {
    end = resolve;
  });

  const fail = (error: Error) => {
    for (const request of pending.values()) request.reject(error);

    pending.clear();
  };

  const stop = (error: Error) => {
    if (closed) return false;

    closed = true;
    loading.clear();
    end(error);
    worker.terminate();
    fail(error);
    listeners.clear();

    return true;
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'The vision worker stopped.');

    if (!stop(error)) return;

    const notify = [...errors];

    errors.clear();
    notify.forEach((listen) => listen({ error: error.message }));
  };
  worker.onmessage = ({ data }) => {
    if (closed) return;

    deliver(data, inbox);
  };

  function request<T>(message: object, transfer: Transferable[] = []): Promise<T> {
    if (closed) return Promise.reject(new Error('The vision runtime is closed.'));

    const id = ++sequence;

    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: (value) => resolve(value as T), reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  const attach = (port: MessagePort) => {
    if (closed) throw new Error('The vision runtime is closed.');

    worker.postMessage({ type: 'attach', port }, [port]);
  };

  return {
    async load(value: VisionManifest, supplied?: Uint8Array): Promise<void> {
      if (closed) throw new Error('The vision runtime is closed.');

      const manifest = validateVisionManifest(value);
      const generation = ++sequence;

      loading.set(manifest.id, generation);

      const payload = await untilStopped(loadPayload(manifest, supplied), ending).catch((error) => {
        if (closed) throw error;

        if (loading.get(manifest.id) !== generation) return undefined;

        throw error;
      });

      if (!payload || loading.get(manifest.id) !== generation) return;

      await request({ type: 'load', manifest, ...payload }, payload.bytes ? [payload.bytes.buffer] : []);
    },
    infer(modelId: string, frame: ImageBitmap | VisionPixels, options: VisionFrameOptions = {}) {
      return request<VisionResult>({ type: 'infer', modelId, frame, options }, 'data' in frame ? [] : [frame]);
    },
    attach,
    connect: attach,
    subscribe(listener: (result: VisionResult) => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    onError(listener: (error: VisionRuntimeError) => void) {
      errors.add(listener);

      return () => {
        errors.delete(listener);
      };
    },
    remove: (modelId: string) => {
      loading.delete(modelId);

      return request<void>({ type: 'remove', modelId });
    },
    close() {
      stop(new Error('The vision runtime is closed.'));
      errors.clear();
    },
  };
}

let shared: ReturnType<typeof createVisionRuntime> | undefined;

export const visionRuntime = () => (shared ??= createVisionRuntime());
