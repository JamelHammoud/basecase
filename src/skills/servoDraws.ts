import type { ServoSpread, SimModel } from '../sim/mjcfTypes';
import { DYNAMICS_TERMS } from '../sim/servoModel';
import { cholesky, correlatedNormal, type Matrix } from '../utils/gaussian';
import { seededRandom, type Random } from '../utils/seededRandom';
import { sha256Hex } from './hash';

export const DRAW_CLIP = 2.5;

export type DynamicsTerm = (typeof DYNAMICS_TERMS)[number];
export type ServoDraw = Record<DynamicsTerm, number>;

function lowerOf(spread: Pick<ServoSpread, 'servo' | 'covariance'>): Matrix {
  const lower = cholesky(spread.covariance, 1e-9);

  if (!lower) throw new Error(`The spread of ${spread.servo} is not a covariance.`);

  return lower;
}

export function drawServo(lower: Matrix, random: Random): ServoDraw {
  const x = correlatedNormal(lower, random, DRAW_CLIP);

  return Object.fromEntries(DYNAMICS_TERMS.map((t, i) => [t, Math.exp(x[i])])) as ServoDraw;
}

export function drawServos(spreads: readonly ServoSpread[] | undefined, random: Random): Record<string, ServoDraw> {
  const out: Record<string, ServoDraw> = {};

  for (const spread of spreads ?? []) {
    const lower = lowerOf(spread);

    for (const joint of spread.joints) out[joint] = drawServo(lower, random);
  }

  return out;
}

export function spreadReach(spread: Pick<ServoSpread, 'servo' | 'covariance'>, term: DynamicsTerm): number {
  const row = lowerOf(spread)[DYNAMICS_TERMS.indexOf(term)];

  return Math.exp(DRAW_CLIP * row.reduce((s, v) => s + Math.abs(v), 0));
}

export const SERVO_GAIN_ROWS = 64;
export const SERVO_GAIN_LIMITS = Object.freeze([0.25, 4] as const);

export function servoGains(model: SimModel, options: { seed: number; joints: readonly string[] }) {
  const robot = new Set(options.joints);
  const spreads = (model.servoSpreads ?? [])
    .map((s) => ({ ...s, joints: s.joints.filter((j) => robot.has(j)) }))
    .filter((s) => s.joints.length);

  if (!spreads.length) return {};

  const random = seededRandom(sha256Hex(`servo-gains|${options.seed}`));
  const actuators = new Map(model.joints.map((j) => [j.id, j.actuator]));
  const nu = Math.max(-1, ...model.joints.map((j) => j.actuator)) + 1;
  const [low, high] = SERVO_GAIN_LIMITS;

  return {
    servoGains: Array.from({ length: SERVO_GAIN_ROWS }, () => {
      const row: Array<number | null> = new Array<number | null>(nu).fill(null);

      for (const [joint, draw] of Object.entries(drawServos(spreads, random)))
        row[actuators.get(joint)!] = Math.min(high, Math.max(low, draw.kp));

      return row;
    }),
  };
}
