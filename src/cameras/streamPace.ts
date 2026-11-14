export const MAX_STREAM_SIZE: [number, number] = [640, 480];
export const MAX_STREAM_FPS = 15;

const EARLY_MS = 1;

export interface StreamAsk {
  width: number;
  height: number;
  fps: number;
}

export interface Pace {
  interval: number;
  due: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

export const streamSize = ([width, height]: [number, number]): [number, number] => [
  Math.round(clamp(width, 1, MAX_STREAM_SIZE[0])),
  Math.round(clamp(height, 1, MAX_STREAM_SIZE[1])),
];

export const streamFps = (fps: number) => clamp(fps, 1, MAX_STREAM_FPS);

export const startPace = (fps: number, now: number): Pace => ({ interval: 1000 / streamFps(fps), due: now });

export const isDue = (pace: Pace, now: number) => now >= pace.due - EARLY_MS;

export function afterDraw(pace: Pace, now: number): Pace {
  const missed = Math.max(0, Math.floor((now - pace.due) / pace.interval));

  return { ...pace, due: pace.due + (missed + 1) * pace.interval };
}

export const dueIds = <K>(paces: Iterable<[K, Pace]>, now: number): K[] =>
  [...paces].filter(([, pace]) => isDue(pace, now)).map(([id]) => id);

export function nextDue(paces: Iterable<Pace>): number {
  let next = Infinity;

  for (const pace of paces) next = Math.min(next, pace.due);

  return next;
}
