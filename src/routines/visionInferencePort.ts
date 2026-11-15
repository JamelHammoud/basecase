import type { VisionResult } from '../vision/types';

interface FrameRequest {
  frame: ImageBitmap;
  modelId: string;
  camera: string;
  timestamp: number;
}

interface Pending {
  request: FrameRequest;
  resolve: (result: VisionResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function visionInferencePort(port: MessagePort, timeoutMs = 30000) {
  let pending: Pending | null = null;
  let closed = false;

  const finish = (result?: VisionResult, error?: Error) => {
    const current = pending;

    if (!current) return;

    pending = null;
    clearTimeout(current.timer);

    if (error) current.reject(error);
    else if (result) current.resolve(result);
  };
  const close = (error = new Error('The Routine vision port is closed.')) => {
    if (closed) return;

    closed = true;
    finish(undefined, error);
    port.onmessage = null;
    port.onmessageerror = null;

    try {
      port.postMessage({ type: 'detach' });
    } catch {
      port.close();

      return;
    }

    port.close();
  };

  port.onmessage = ({ data }) => {
    const current = pending;

    if (!current) return;

    const value = data.result ?? data;
    const matches = value.camera === current.request.camera && value.modelId === current.request.modelId;

    if (!matches) return;

    if (data.type === 'error') finish(undefined, new Error(data.error));
    else if (data.type === 'result' && value.timestamp === current.request.timestamp) finish(value);
  };
  port.onmessageerror = () => close(new Error('The Routine vision response could not be decoded.'));
  port.start();

  const infer = (request: FrameRequest): Promise<VisionResult> => {
    if (closed || pending) {
      request.frame.close();

      return Promise.reject(new Error(closed ? 'The Routine vision port is closed.' : 'A vision frame is pending.'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => close(new Error('Routine vision inference timed out.')), timeoutMs);

      pending = { request, resolve, reject, timer };

      try {
        port.postMessage({ type: 'frame', ...request }, [request.frame]);
      } catch (error) {
        request.frame.close();
        close(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  return { infer, close };
}
