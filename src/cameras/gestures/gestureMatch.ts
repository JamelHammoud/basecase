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
  private readonly costs: Float64Array;

  constructor(example: GestureExample) {
    this.example = example;
    this.costs = new Float64Array(example.length + 1).fill(Number.POSITIVE_INFINITY);
    this.costs[0] = 0;
  }

  step(frame: ArrayLike<number>): number {
    const m = this.example.length;
    const costs = this.costs;
    let diagonal = 0;

    for (let j = 1; j <= m; j++) {
      const previous = costs[j];

      costs[j] = frameGap(frame, this.example[j - 1]) + Math.min(diagonal, previous, costs[j - 1]);
      diagonal = previous;
    }

    return costs[m] / m;
  }
}

export function bestMatch(example: GestureExample, stream: GestureExample): number {
  const match = new SpringMatch(example);

  return Math.min(...stream.map((frame) => match.step(frame)));
}

function pairSpread(a: GestureExample, b: GestureExample): number {
  if (!a.length || !b.length) return Math.max(bestMatch(a, b), bestMatch(b, a));

  const forward = new Float64Array(a.length + 1).fill(Infinity);
  const reverse = new Float64Array(a.length + 1);
  let best = Infinity;

  forward[0] = 0;

  for (const frame of b) {
    let forwardDiagonal = 0;
    let reverseDiagonal = reverse[0];

    reverse[0] = Infinity;

    for (let i = 1; i <= a.length; i++) {
      const forwardPrevious = forward[i];
      const reversePrevious = reverse[i];
      const gap = frameGap(frame, a[i - 1]);

      forward[i] = gap + Math.min(forwardDiagonal, forwardPrevious, forward[i - 1]);
      reverse[i] = gap + Math.min(reverseDiagonal, reverse[i - 1], reversePrevious);
      forwardDiagonal = forwardPrevious;
      reverseDiagonal = reversePrevious;
    }

    best = Math.min(best, forward[a.length] / a.length);
  }

  let reverseBest = Infinity;

  for (let i = 1; i <= a.length; i++) reverseBest = Math.min(reverseBest, reverse[i] / b.length);

  return Math.max(best, reverseBest);
}

export function matchThreshold(examples: GestureExample[]): number {
  let spread = 0;

  for (let i = 0; i < examples.length; i++)
    for (let j = i + 1; j < examples.length; j++)
      if (examples[i] !== examples[j]) spread = Math.max(spread, pairSpread(examples[i], examples[j]));

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
