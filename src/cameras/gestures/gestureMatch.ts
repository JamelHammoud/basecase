import { GESTURE_POINTS } from './gestureFrame';

export type GestureExample = number[][];

export const EXAMPLE_FPS = 15;
export const MAX_EXAMPLE_SECONDS = 3;
export const MAX_EXAMPLE_FRAMES = EXAMPLE_FPS * MAX_EXAMPLE_SECONDS;

const UNSEEN_GAP = 4;
const MOVED = 0.08;
const MIN_FRAMES = 3;
const SPREAD_FACTOR = 1.8;
const MIN_THRESHOLD = 0.12;

export function frameGap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  let seen = 0;

  for (let i = 0; i < GESTURE_POINTS.length * 3; i += 3) {
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);

    if (!Number.isFinite(d)) continue;

    sum += d;
    seen++;
  }

  return seen ? sum / seen : UNSEEN_GAP;
}

export class SpringMatch {
  private readonly example: GestureExample;
  private previous: Float64Array;
  private current: Float64Array;

  constructor(example: GestureExample) {
    this.example = example;
    this.previous = new Float64Array(example.length + 1).fill(Number.POSITIVE_INFINITY);
    this.current = new Float64Array(example.length + 1);
    this.previous[0] = 0;
  }

  step(frame: ArrayLike<number>): number {
    const m = this.example.length;
    const prev = this.previous;
    const cur = this.current;

    cur[0] = 0;

    for (let j = 1; j <= m; j++)
      cur[j] = frameGap(frame, this.example[j - 1]) + Math.min(prev[j - 1], prev[j], cur[j - 1]);

    this.previous = cur;
    this.current = prev;

    return cur[m] / m;
  }
}

export function bestMatch(example: GestureExample, stream: GestureExample): number {
  const match = new SpringMatch(example);

  return Math.min(...stream.map((frame) => match.step(frame)));
}

export function matchThreshold(examples: GestureExample[]): number {
  let spread = 0;

  for (const a of examples) for (const b of examples) if (a !== b) spread = Math.max(spread, bestMatch(a, b));

  return Math.max(MIN_THRESHOLD, spread * SPREAD_FACTOR);
}

export function trimExample(frames: GestureExample): GestureExample | null {
  if (frames.length < MIN_FRAMES) return null;

  const first = frames[0];
  const last = frames[frames.length - 1];
  const start = frames.findIndex((f) => frameGap(f, first) > MOVED);
  const end = frames.findLastIndex((f) => frameGap(f, last) > MOVED);

  if (start < 0 || end - start < MIN_FRAMES - 1) return null;

  return frames.slice(Math.max(0, start - 1), Math.min(frames.length, end + 2)).slice(0, MAX_EXAMPLE_FRAMES);
}

export function filledFrames(frames: ArrayLike<number>[]): GestureExample {
  const width = GESTURE_POINTS.length * 3;
  const last = new Array<number>(width).fill(0);

  return frames.map((frame) =>
    Array.from({ length: width }, (_, i) => {
      if (Number.isFinite(frame[i])) last[i] = Math.round(frame[i] * 1000) / 1000 || 0;

      return last[i];
    }),
  );
}
