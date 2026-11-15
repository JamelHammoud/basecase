import { hubBridge } from '../hub/hubBridge';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { SEGMENTATION_MODELS } from './segmentationModels';
import type { ImageMask } from './frameSet';
import type { SegmentationPoint } from './segmentationMath';
import type { VisionPixels } from './types';

type Frame = ImageBitmap | VisionPixels;

interface Pending {
  resolve(value: unknown): void;

  reject(error: Error): void;
}

async function graphSources(closed: () => boolean) {
  if (IS_WEB_DEMO) return {};

  const sources: Record<string, string> = {};

  for (const [name, model] of Object.entries(SEGMENTATION_MODELS)) {
    const source = (await hubBridge.modelFile(model)).url;

    if (closed()) throw new Error('The segmentation runtime is closed.');

    if (typeof source !== 'string') throw new Error('The model cache address must stay inside Basecase.');

    sources[name] = source;
  }

  return sources;
}

export function createSegmentationRuntime() {
  const worker = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' });
  let pending: Pending | undefined;
  let sequence = 0;
  let closed = false;
  let loading: Promise<void> | undefined;
  let finish: ((error: Error) => void) | undefined;
  const ended = new Promise<Error>((resolve) => {
    finish = resolve;
  });

  function stop(error: Error) {
    if (closed) return;

    closed = true;
    finish?.(error);
    worker.terminate();
    pending?.reject(error);
    pending = undefined;
  }

  worker.onerror = (event) => stop(new Error(event.message || 'The segmentation worker stopped.'));
  worker.onmessage = ({ data }) => {
    if (closed || data.id !== sequence) return;

    const request = pending;

    pending = undefined;

    if (data.error) request?.reject(new Error(data.error));
    else request?.resolve(data.result);
  };

  function request<T>(message: object, transfer: Transferable[] = []): Promise<T> {
    if (closed) return Promise.reject(new Error('The segmentation runtime is closed.'));

    if (pending) return Promise.reject(new Error('Wait for the current segmentation frame.'));

    return new Promise<T>((resolve, reject) => {
      pending = { resolve: (value) => resolve(value as T), reject };
      sequence++;

      try {
        worker.postMessage({ ...message, id: sequence }, transfer);
      } catch (error) {
        pending = undefined;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function requestFrame(type: 'segment' | 'next', frame: Frame, points?: SegmentationPoint[]) {
    return request<ImageMask>({ type, frame, points }, 'data' in frame ? [] : [frame]).catch((error) => {
      if (!('data' in frame)) frame.close();

      throw error;
    });
  }

  return {
    load(): Promise<void> {
      if (closed) return Promise.reject(new Error('The segmentation runtime is closed.'));

      loading ??= Promise.race([
        graphSources(() => closed).then((sources) => request<void>({ type: 'load', sources })),
        ended.then((error) => {
          throw error;
        }),
      ]).catch((error) => {
        loading = undefined;

        throw error;
      });

      return loading;
    },
    segment: (frame: Frame, points: SegmentationPoint[]) => requestFrame('segment', frame, points),
    next: (frame: Frame) => requestFrame('next', frame),
    reset: () => request<void>({ type: 'reset' }),
    close: () => stop(new Error('The segmentation runtime is closed.')),
  };
}
