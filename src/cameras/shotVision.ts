import type { VisionDetection, VisionResult } from '../vision/types';
import { errorMessage } from '../utils/errorMessage';
import type { VisionAssignment } from './visionFrames';
import { preferredVisionDetections } from './visionSignals';

export interface ShotVisionResult {
  detections: VisionDetection[];
  error?: string;
}

interface Waiter {
  resolve: (result: VisionResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const keyOf = (camera: string, modelId: string) => JSON.stringify([camera, modelId]);

export function createShotVision(copy: (camera: string, source: ImageBitmap) => ImageBitmap) {
  let port: MessagePort | null = null;
  let assignments: VisionAssignment[] = [];
  let sequence = 0;
  const namespace = `camera-shot:${crypto.randomUUID()}`;
  const waiting = new Map<string, Waiter>();

  const refuse = (key: string, message: string) => {
    const waiter = waiting.get(key);

    if (!waiter) return;

    waiting.delete(key);
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  };

  const receive = ({ data }: MessageEvent) => {
    const result = data.result as VisionResult | undefined;
    const key = keyOf(result?.camera ?? data.camera, result?.modelId ?? data.modelId);
    const waiter = waiting.get(key);

    if (!waiter) return;

    if (data.type === 'error' || data.type === 'dropped') {
      refuse(key, data.error ?? 'The camera shot was replaced before inference. Capture the camera again.');

      return;
    }

    if (data.type !== 'result' || !result) return;

    waiting.delete(key);
    clearTimeout(waiter.timer);
    waiter.resolve(result);
  };

  const request = (camera: string, modelId: string, source: ImageBitmap, sourceKey: string): Promise<VisionResult> => {
    const key = keyOf(camera, modelId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => refuse(key, 'The camera detector stopped responding. Capture the camera again.'),
        60000,
      );

      waiting.set(key, { resolve, reject, timer });

      let frame: ImageBitmap | null = null;

      try {
        if (!port) throw new Error('Connect the camera detector before capturing its image.');

        frame = copy(sourceKey, source);

        const identity = assignments.find(
          (assignment) => assignment.camera === sourceKey && assignment.modelId === modelId,
        )?.source;

        port.postMessage({ type: 'frame', source: identity, camera, modelId, frame, timestamp: performance.now() }, [
          frame,
        ]);
      } catch (error) {
        frame?.close();
        refuse(key, errorMessage(error));
      }
    });
  };

  return {
    connect(next: MessagePort, models: VisionAssignment[]) {
      for (const key of waiting.keys())
        refuse(key, 'The camera detector connection changed. Capture the camera again.');

      port?.postMessage({ type: 'detach' });
      port?.close();
      port = next;
      port.onmessage = receive;
      port.onmessageerror = () => {
        for (const key of waiting.keys()) refuse(key, 'The camera result could not be read. Capture the camera again.');
      };
      assignments = models;
    },
    async infer(camera: string, source: ImageBitmap): Promise<ShotVisionResult> {
      const models = [
        ...new Set(
          assignments.filter((assignment) => assignment.camera === camera).map((assignment) => assignment.modelId),
        ),
      ];

      if (!models.length) return { detections: [], error: 'Load a camera model before reading this camera.' };

      const shot = `${namespace}:${++sequence}:${camera}`;
      const outcomes = await Promise.allSettled(models.map((modelId) => request(shot, modelId, source, camera)));
      const results = outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
      const errors = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [`${models[index]}: ${errorMessage(outcome.reason)}`] : [],
      );

      return { detections: preferredVisionDetections(results), ...(errors.length ? { error: errors.join(' ') } : {}) };
    },
    close() {
      for (const key of waiting.keys()) refuse(key, 'The camera capture closed before inference finished.');

      port?.postMessage({ type: 'detach' });
      port?.close();
      port = null;
    },
  };
}
