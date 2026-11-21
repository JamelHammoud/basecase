import { workerClient } from '../utils/workerRpc';
import type { BodyMotionPreview } from './bodyMotionTypes';

type RenderHandlers = {
  load: (preview: BodyMotionPreview) => Promise<{ result: boolean }>;
  frame: (index: number) => Promise<{ result: ImageBitmap }>;
};

let metrics = { submissionMs: 0, paintMs: 0, frames: 0 };

export const bodyMotionRenderMetrics = () => ({ ...metrics });

export function bodyMotionRenderer(input: {
  preview: BodyMotionPreview;
  draw: (frame: number, bitmap: ImageBitmap) => void;
  failed: (error: unknown) => void;
}) {
  const client = workerClient<RenderHandlers>(
    () => new Worker(new URL('./bodyMotionRenderer.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('Can’t tell.');
    },
  );
  const started = performance.now();
  const loading = client.call('load', input.preview);

  metrics = { submissionMs: performance.now() - started, paintMs: 0, frames: 0 };

  let desired = 0;
  let shown = -1;
  let busy = false;
  let disposed = false;
  const draw = async () => {
    if (busy || disposed) return;

    busy = true;

    try {
      await loading;

      while (!disposed && shown !== desired) {
        const frame = desired;
        const bitmap = await client.call('frame', frame);

        if (disposed || frame !== desired) {
          bitmap.close();

          continue;
        }

        const painting = performance.now();

        input.draw(frame, bitmap);
        metrics.paintMs = Math.max(metrics.paintMs, performance.now() - painting);
        metrics.frames++;
        shown = frame;
      }
    } catch (error) {
      if (!disposed) input.failed(error);
    } finally {
      busy = false;
    }
  };

  return {
    seek: (frame: number) => {
      desired = frame;
      void draw();
    },
    dispose: () => {
      disposed = true;
      client.dispose();
    },
  };
}
