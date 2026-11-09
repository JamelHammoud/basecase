import { between, pick, type Rng } from '../zoo/rng';
import { HiddenTwin, LOG_DT, type Payload, type ServoLog } from './plant';
import type { Family, TwinUnit } from './units';

const SECONDS = 10;
const TICKS = Math.round(SECONDS / LOG_DT);

export const PAYLOADS: Record<Family, Payload[]> = {
  sts3215: [
    { massKg: 0.1, armM: 0.1 },
    { massKg: 0.25, armM: 0.12 },
    { massKg: 0.4, armM: 0.15 },
  ],
  xl330: [
    { massKg: 0.03, armM: 0.05 },
    { massKg: 0.07, armM: 0.06 },
    { massKg: 0.12, armM: 0.08 },
  ],
};

const times = () => Array.from({ length: TICKS }, (_, i) => i * LOG_DT);

export function chirp(rng: Rng): number[] {
  const amp = between(rng, 0.4, 0.7);
  const [f0, f1] = [0.2, between(rng, 2, 3)];

  return times().map((t) => amp * Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * SECONDS))));
}

export function steps(rng: Rng): number[] {
  const out: number[] = [];
  let level = 0;
  let next = 0;

  for (const t of times()) {
    if (t >= next) {
      level = between(rng, -0.9, 0.9);
      next = t + between(rng, 0.6, 1.4);
    }

    out.push(level);
  }

  return out;
}

export function multisine(rng: Rng): number[] {
  const tones = [0.3, 0.8, 1.6, 2.7].map((f) => ({ f, a: between(rng, 0.1, 0.25), p: between(rng, 0, 2 * Math.PI) }));

  return times().map((t) => tones.reduce((sum, w) => sum + w.a * Math.sin(2 * Math.PI * w.f * t + w.p), 0));
}

export function heldOut(rng: Rng): number[] {
  const out: number[] = [];
  let from = 0;
  let to = between(rng, -0.8, 0.8);
  let start = 0;
  let length = between(rng, 0.4, 1.2);
  let ramp = pick(rng, [true, false]);

  for (const t of times()) {
    if (t >= start + length) {
      [from, start, length, ramp] = [to, t, between(rng, 0.4, 1.2), pick(rng, [true, false])];
      to = between(rng, -0.8, 0.8);
    }

    const k = ramp ? Math.min(1, (t - start) / length) : 1;

    out.push(from + (to - from) * k);
  }

  return out;
}

export interface UnitLogs {
  calibration: ServoLog[];
  replay: ServoLog;
  otherLoad: ServoLog;
}

export type Player = (goalRad: number[], payload: Payload) => ServoLog;

export function recordUnit(unit: TwinUnit, rng: Rng, player?: Player): UnitLogs {
  const [a, b, held] = PAYLOADS[unit.family];
  const twin = new HiddenTwin(unit, 0);
  const play: Player = player ?? ((goal, payload) => twin.run(goal, payload));
  const calibration = [a, b].flatMap((payload) => [chirp, steps, multisine].map((make) => play(make(rng), payload)));

  return {
    calibration,
    replay: play(heldOut(rng), pick(rng, [a, b])),
    otherLoad: play(heldOut(rng), held),
  };
}
