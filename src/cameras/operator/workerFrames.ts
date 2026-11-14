import { wallClock } from './poseProtocol';
import type { Picture } from './runners';

export interface FrameQueue {
  take: (picture: Picture) => void;
  pump: (frames: ReadableStream<VideoFrame>) => Promise<void>;
  stop: () => void;
}

export interface FrameQueueOptions {
  wanted: () => boolean;
  detect: (picture: Picture, seenAt: number) => void;
  fail: (e: unknown) => void;
}

export function createFrameQueue({ wanted, detect, fail }: FrameQueueOptions): FrameQueue {
  let latest: { picture: Picture; seenAt: number } | null = null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  let scheduled = false;

  const dropLatest = () => {
    latest?.picture.close();
    latest = null;
  };

  const detectLatest = () => {
    scheduled = false;

    const frame = latest;

    latest = null;

    if (!frame) return;

    try {
      if (wanted()) detect(frame.picture, frame.seenAt);
    } catch (e) {
      fail(e);
    } finally {
      frame.picture.close();
    }
  };

  const take = (picture: Picture) => {
    const seenAt = wallClock();

    if (!wanted()) return picture.close();

    dropLatest();
    latest = { picture, seenAt };

    if (scheduled) return;

    scheduled = true;
    setTimeout(detectLatest, 0);
  };

  return {
    take,
    pump: async (frames) => {
      reader = frames.getReader();

      for (;;) {
        const { value, done } = await reader.read();

        if (done) return;

        take(value);
      }
    },
    stop: () => {
      dropLatest();
      void reader?.cancel().catch(() => undefined);
    },
  };
}
