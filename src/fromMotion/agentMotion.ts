import { bvhText, motionName } from '../agent/agentRetarget';
import { angle } from '../utils/angle';
import { servoShortfall } from '../utils/motionServos';
import { TOLERANCE_SHARE, type MotionFit, type MotionSkeleton } from '../utils/motionSkeleton';
import { lengthLabel } from '../utils/size';
import { plural } from '../../electron/plural.mjs';
import { placeMotion, type MotionScene } from './motionBuild';
import type { MotionFitRequest } from './motionFitOps';

export interface MotionToolContext extends MotionScene {
  solve: (request: MotionFitRequest) => Promise<MotionSkeleton>;
}

export interface MotionPayload {
  text?: string;
  url?: string;
  file?: string;
  name?: string;
  height_mm?: unknown;
  tolerance_mm?: unknown;
  limbs?: unknown;
}

const usd = (v: number) => `$${v.toFixed(2)}`;

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

const limbNames = (raw: unknown) =>
  Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string' && !!l.trim()) : undefined;

function jointLines(fit: MotionFit): string {
  const byId = new Map(fit.skeleton.joints.map((j) => [j.id, j]));

  return fit.joints
    .map((j) => {
      const s = byId.get(j.id)!;
      const [lo, hi] = s.range ?? [0, 0];
      const on = s.parent ? `, on ${s.parent}` : '';

      return `${j.id} (${j.limb}${on}): range ${angle(lo)} to ${angle(hi)}, peak ${Math.round(j.speedDps)}°/s and ${Math.round(j.accelDps2)}°/s²`;
    })
    .join('; ');
}

function servoLines(fit: MotionFit): string[] {
  const s = fit.servos;
  const shortfall = servoShortfall(s);

  if (!s) return [`${shortfall} Pick actuators with size_actuators.`];

  const picks = fit.joints.map((j) => `${j.id} ${s.names[j.id]}`).join('; ');
  const lines = [
    `Servos at ${s.volts} V from ${s.rail}, each picked for its joint's load at its peak speed: ${picks}. Servos ${usd(s.servosUsd)}, ${usd(s.costUsd)} with the battery, regulator and bus adapter.`,
  ];

  return shortfall ? [...lines, shortfall] : lines;
}

function motionText(fit: MotionFit, name: string, heightMm: number, toleranceMm: number): string {
  const moving = new Set(fit.joints.map((j) => j.limb));
  const paths = fit.paths.filter((p) => moving.has(p.limb));
  const still = fit.paths.filter((p) => !moving.has(p.limb)).map((p) => p.limb);

  return [
    `Fitted ${plural(fit.joints.length, 'joint')} to ${name} at ${lengthLabel(heightMm)} tall, every limb within ${lengthLabel(toleranceMm)} of the clip, and placed the skeleton (replacing any) with one servo per joint.`,
    `Joints: ${jointLines(fit)}.`,
    ...servoLines(fit),
    `Paths: ${paths.map((p) => `${p.limb} within ${lengthLabel(p.errorMm)}`).join(', ')}.`,
    ...(still.length ? [`Still in the clip, so no joints: ${still.join(', ')}.`] : []),
    'Joint ids match define_skeleton. Design the body on it: add_parts with frame: "<joint id>", then define_joints.',
  ].join('\n');
}

export async function skeletonFromMotionRequest(payload: MotionPayload, ctx: MotionToolContext) {
  const heightMm = payload.height_mm;
  const toleranceMm = payload.tolerance_mm;

  if (!positive(heightMm)) return { text: 'Give height_mm: how tall the robot stands, in mm.' };

  if (toleranceMm !== undefined && !positive(toleranceMm)) return { text: 'Give tolerance_mm above 0.' };

  const source = await bvhText(payload);

  if ('error' in source) return { text: source.error };

  const name = motionName(payload);
  const tolerance = positive(toleranceMm) ? toleranceMm : heightMm * TOLERANCE_SHARE;
  const result = await ctx.solve({
    text: source.text,
    name,
    heightMm,
    toleranceMm: tolerance,
    limbs: limbNames(payload.limbs),
  });

  if (!('fit' in result)) return { text: `No skeleton: ${result.problem}` };

  placeMotion(result.fit, name, ctx);

  return { text: motionText(result.fit, name, heightMm, tolerance) };
}
