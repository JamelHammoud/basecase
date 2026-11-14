import { frameSource } from '../cameras/operator/operatorFrames';
import type { TakeVideoReply, TakeVideoRequest, VideoRecorder } from './takeVideoProtocol';

export function workerRecorder(stream: MediaStream): VideoRecorder {
  const copy = new MediaStream(stream.getVideoTracks().map((track) => track.clone()));
  const worker = new Worker(new URL('./takeVideo.worker.ts', import.meta.url), { type: 'module' });
  const frames = frameSource(copy, worker);
  let finished: Promise<Uint8Array | null> | null = null;

  const release = () => {
    frames.stop();
    copy.getTracks().forEach((track) => track.stop());
  };

  const open: TakeVideoRequest = { type: 'open', frames: frames.frames };

  worker.postMessage(open, frames.frames ? [frames.frames] : []);

  const finish = () =>
    new Promise<Uint8Array | null>((resolve) => {
      const settle = (bytes: Uint8Array | null) => {
        worker.terminate();
        resolve(bytes);
      };

      worker.onmessage = (ev: MessageEvent<TakeVideoReply>) => settle(ev.data.bytes);
      worker.onerror = () => settle(null);
      release();
      worker.postMessage({ type: 'finish' } satisfies TakeVideoRequest);
    });

  return {
    finish: () => (finished ??= finish()),
    drop: () => {
      release();
      worker.terminate();
    },
  };
}
