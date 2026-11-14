import { frameSource } from '../cameras/operator/operatorFrames';
import { writeTryVideo } from '../cases/tryStore';
import type { TakeVideoReply, TakeVideoRequest, VideoRecorder } from './takeVideoProtocol';

export function workerRecorder(id: string, stream: MediaStream, lead: number): VideoRecorder {
  const copy = new MediaStream(stream.getVideoTracks().map((track) => track.clone()));
  const worker = new Worker(new URL('./takeVideo.worker.ts', import.meta.url), { type: 'module' });
  const frames = frameSource(copy, worker);
  let writes: Promise<boolean> = Promise.resolve(true);
  let encoded: ((ok: boolean) => void) | null = null;
  let ended: boolean | null = null;
  let finished: Promise<boolean> | null = null;

  const write = (position: number, data: Uint8Array) => {
    writes = writes.then((ok) => ok && writeTryVideo(id, position, data).catch(() => false));
  };

  const release = () => {
    frames.stop();
    copy.getTracks().forEach((track) => track.stop());
  };

  const settle = (ok: boolean) => {
    worker.terminate();
    ended ??= ok;
    encoded?.(ended);
  };

  worker.onmessage = (ev: MessageEvent<TakeVideoReply>) => {
    const reply = ev.data;

    if (reply.type === 'chunk') write(reply.position, reply.data);
    else settle(reply.ok);
  };
  worker.onerror = () => settle(false);

  const open: TakeVideoRequest = { type: 'open', frames: frames.frames, lead };

  worker.postMessage(open, frames.frames ? [frames.frames] : []);

  const finish = async () => {
    release();

    const ok =
      ended ??
      (await new Promise<boolean>((resolve) => {
        encoded = resolve;
        worker.postMessage({ type: 'finish' } satisfies TakeVideoRequest);
      }));

    return (await writes) && ok;
  };

  return {
    finish: () => (finished ??= finish()),
    drop: async () => {
      release();
      worker.terminate();
      await writes;
    },
  };
}
