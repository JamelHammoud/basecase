import type { PoseLandmark } from '../operator/poseLandmarks';
import { BUILTIN_DETECTORS, BUILTIN_GESTURES, WINDOW_S } from './builtinGestures';
import { gestureFrame, type GestureFrame } from './gestureFrame';
import {
  EXAMPLE_FPS,
  filledFrames,
  matchThreshold,
  SpringMatch,
  trimExample,
  type GestureExample,
} from './gestureMatch';

export interface TaughtGesture {
  name: string;
  examples: GestureExample[];
}

export interface GestureStep {
  fired: string[];
  sample: number[] | null;
}

export const REARM_S = 0.5;

const SAMPLE_S = 1 / EXAMPLE_FPS - 0.005;

interface Matcher {
  name: string;
  threshold: number;
  springs: SpringMatch[];
}

function refractory() {
  const quietSince = new Map<string, number>();
  const fired = new Set<string>();

  const quiet = (name: string, t: number) => {
    if (!quietSince.has(name)) quietSince.set(name, t);

    if (t - quietSince.get(name)! >= REARM_S) fired.delete(name);

    return false;
  };

  return (name: string, seen: boolean, t: number) => {
    if (!seen) return quiet(name, t);

    quietSince.delete(name);

    if (fired.has(name)) return false;

    fired.add(name);

    return true;
  };
}

const matchers = (taught: readonly TaughtGesture[]): Matcher[] =>
  taught
    .filter((g) => g.examples.length > 0)
    .map((g) => ({
      name: g.name,
      threshold: matchThreshold(g.examples),
      springs: g.examples.map((e) => new SpringMatch(e)),
    }));

export interface GestureRecognizer {
  step: (world: PoseLandmark[] | null, tMs: number) => GestureStep;
  teach: (taught: readonly TaughtGesture[]) => void;
}

export function createGestureRecognizer(taught: readonly TaughtGesture[] = []): GestureRecognizer {
  const window: GestureFrame[] = [];
  const gate = refractory();
  let taughtMatchers = matchers(taught);
  let sampledAt = Number.NEGATIVE_INFINITY;

  const matchTaught = (frame: GestureFrame, t: number): string[] =>
    taughtMatchers.flatMap((m) => {
      const cost = Math.min(...m.springs.map((s) => s.step(frame.p)));

      return gate(`taught:${m.name}`, cost < m.threshold, t) ? [m.name] : [];
    });

  return {
    step: (world, tMs) => {
      const t = tMs / 1000;
      const frame = world ? gestureFrame(world, t) : null;

      if (!frame) {
        window.length = 0;
        BUILTIN_GESTURES.forEach((name) => gate(name, false, t));

        return { fired: [], sample: null };
      }

      window.push(frame);

      while (window.length && window[0].t < t - WINDOW_S) window.shift();

      const fired = BUILTIN_GESTURES.filter((name) => gate(name, BUILTIN_DETECTORS[name](window), t));
      const sampling = t - sampledAt >= SAMPLE_S;

      if (!sampling) return { fired, sample: null };

      sampledAt = t;

      return { fired: [...fired, ...matchTaught(frame, t)], sample: Array.from(frame.p) };
    },
    teach: (next) => {
      taughtMatchers = matchers(next);
    },
  };
}

export interface FiredGesture {
  at: number;
  name: string;
}

export function recognize(
  samples: Array<{ t: number; world: PoseLandmark[] }>,
  taught: readonly TaughtGesture[] = [],
): FiredGesture[] {
  const recognizer = createGestureRecognizer(taught);

  return samples.flatMap((s) => recognizer.step(s.world, s.t).fired.map((name) => ({ at: s.t / 1000, name })));
}

export const recordedExample = (samples: ArrayLike<number>[]): GestureExample | null =>
  trimExample(filledFrames(samples));

export function exampleFrom(samples: Array<{ t: number; world: PoseLandmark[] }>): GestureExample | null {
  const recognizer = createGestureRecognizer();

  return recordedExample(
    samples.flatMap((s) => {
      const sample = recognizer.step(s.world, s.t).sample;

      return sample ? [sample] : [];
    }),
  );
}
