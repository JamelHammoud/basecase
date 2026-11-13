import type { BenchPayload } from './types';

export const BENCH = Object.freeze({
  speedRadS: 0.12,
  holdS: 0.6,
  levelsRad: [0.25, -0.15, 0],
  sineRad: 0.15,
  sineHz: 0.12,
  logS: 9,
  logs: 2,
});

export const BENCH_SECONDS = BENCH.logS * BENCH.logs;

export const EMULATED_LOAD: BenchPayload = Object.freeze({ massKg: 0.2, armM: 0.1 });

function rampPoints(): Array<[number, number]> {
  const points: Array<[number, number]> = [
    [0, 0],
    [BENCH.holdS, 0],
  ];
  let t = BENCH.holdS;
  let at = 0;

  for (const level of BENCH.levelsRad) {
    t += Math.abs(level - at) / BENCH.speedRadS;
    points.push([t, level]);
    t += BENCH.holdS;
    points.push([t, level]);
    at = level;
  }

  return points;
}

const RAMPS = rampPoints();

function ramps(s: number): number {
  const i = RAMPS.findIndex(([t]) => s <= t);

  if (i === 0) return RAMPS[0][1];

  if (i < 0) return RAMPS[RAMPS.length - 1][1];

  const [t0, v0] = RAMPS[i - 1];
  const [t1, v1] = RAMPS[i];

  return v0 + ((v1 - v0) * (s - t0)) / (t1 - t0);
}

const sine = (s: number) =>
  s < BENCH.holdS ? 0 : BENCH.sineRad * Math.sin(2 * Math.PI * BENCH.sineHz * (s - BENCH.holdS));

export function benchOffset(seconds: number): number {
  if (seconds <= 0 || seconds >= BENCH_SECONDS) return 0;

  return seconds < BENCH.logS ? ramps(seconds) : sine(seconds - BENCH.logS);
}
