export type LoopRange = [number, number];

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function nextSpeed(speed: number, by: 1 | -1, wrap = false): number {
  const at = SPEEDS.findIndex((s) => s >= speed);
  const index = (at < 0 ? SPEEDS.length - 1 : at) + by;

  if (wrap) return SPEEDS[(index + SPEEDS.length) % SPEEDS.length];

  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index))];
}

export function loopedFrame([from, to]: LoopRange, start: number, moved: number): number {
  const span = to - from + 1;

  return from + ((((start - from + moved) % span) + span) % span);
}

export const speedText = (speed: number) => `${speed}×`;
