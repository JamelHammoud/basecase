import type { PoseLandmark } from '../operator/poseLandmarks';
import type { GestureExample } from './gestureMatch';
import { createGestureRecognizer, recordedExample, type TaughtGesture } from './gestureRecognizer';

export type GestureNews = { type: 'gesture'; name: string } | { type: 'example'; example: GestureExample | null };

export interface GestureTap {
  step: (world: PoseLandmark[] | null, tMs: number) => void;
  teach: (taught: readonly TaughtGesture[]) => void;
  record: (ms: number) => void;
  stop: () => void;
}

export const QUIET_MS = 1000;

interface Recording {
  samples: number[][];
  ms: number;
  from: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createGestureTap(post: (news: GestureNews) => void): GestureTap {
  const recognizer = createGestureRecognizer();
  let recording: Recording | null = null;

  const finish = () => {
    if (!recording) return;

    const { samples, timer } = recording;

    clearTimeout(timer);
    recording = null;
    post({ type: 'example', example: recordedExample(samples) });
  };

  const keep = (taking: Recording, sample: number[] | null, tMs: number) => {
    taking.from ??= tMs;

    if (sample) taking.samples.push(sample);

    clearTimeout(taking.timer);

    if (tMs - taking.from >= taking.ms) return finish();

    taking.timer = setTimeout(finish, QUIET_MS);
  };

  return {
    step: (world, tMs) => {
      const { fired, sample } = recognizer.step(world, tMs);

      for (const name of fired) post({ type: 'gesture', name });

      if (recording) keep(recording, sample, tMs);
    },
    teach: (taught) => recognizer.teach(taught),
    record: (ms) => {
      if (recording) clearTimeout(recording.timer);

      recording = { samples: [], ms, from: null, timer: undefined };
    },
    stop: () => {
      if (recording) clearTimeout(recording.timer);

      recording = null;
    },
  };
}
