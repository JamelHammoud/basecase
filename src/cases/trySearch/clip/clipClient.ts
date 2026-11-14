import { workerClient } from '../../../utils/workerRpc';
import type { ClipHandlers } from './clipHandlers';
import type { ClipImage } from './clipImage';

const client = workerClient<ClipHandlers>(
  () => new Worker(new URL('./clip.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./clipHandlers')).clipHandlers,
);

export const embedText = (text: string): Promise<Float32Array> => client.call('text', text);

export const embedFrames = (frames: ClipImage[]): Promise<Float32Array[]> =>
  client.call(
    'images',
    frames,
    frames.map((f) => f.data.buffer),
  );
