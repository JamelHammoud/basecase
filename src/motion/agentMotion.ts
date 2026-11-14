import { r1 } from '../agent/agentFrame';
import { readBvh } from '../agent/agentRetarget';
import { angle } from '../utils/angle';
import { clipOf } from '../utils/motionClip';
import type { MotionDesign, MotionDesignResult } from '../utils/motionDesign';
import { MAX_HEIGHT_MM, MIN_HEIGHT_MM, type MotionRequest } from '../utils/motionSkeleton';
import { lengthLabel } from '../utils/size';
import { placeMotionDesign, type MotionScene } from './motionBuild';
import type { MotionDesignCall } from './motionDesignOps';
import { plural } from '../../electron/plural.mjs';

export interface MotionToolContext extends MotionScene {
  solve: (call: MotionDesignCall) => Promise<MotionDesignResult>;
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
const mm = (v: number[]) => `[${v.map((x) => r1(x) + 0).join(', ')}]`;

function readRequest(p: MotionPayload): MotionRequest | string {
  const heightMm = Number(p.height_mm);
  const tolerance = p.tolerance_mm === undefined ? undefined : Number(p.tolerance_mm);

  if (!Number.isFinite(heightMm) || heightMm < MIN_HEIGHT_MM || heightMm > MAX_HEIGHT_MM)
    return `Give height_mm from ${MIN_HEIGHT_MM} to ${MAX_HEIGHT_MM}: the robot's height standing, as the performer stands.`;

  if (tolerance !== undefined && (Number.isNaN(tolerance) || tolerance <= 0)) return 'Give tolerance_mm above 0.';

  const limbs = Array.isArray(p.limbs) ? p.limbs.filter((l): l is string => typeof l === 'string') : undefined;

  return { heightMm, ...(tolerance ? { toleranceMm: tolerance } : {}), ...(limbs?.length ? { limbs } : {}) };
}

function limbLines(design: MotionDesign): string[] {
  return design.limbs.map((l) =>
    l.joints.length
      ? `- ${l.id}: ${l.joints.join(', ')}; its end stays within ${lengthLabel(l.effectorMm)} of the clip`
      : `- ${l.id}: holds still, no joints`,
  );
}

function jointLines(design: MotionDesign): string[] {
  return design.skeleton.joints.map((j, i) => {
    const pace = design.motion[j.id];
    const [lo, hi] = j.range!;

    return `- ${j.id} at ${mm(j.origin)} axis ${mm(j.axis)}, range ${angle(lo)} to ${angle(hi)}, peak ${pace.peakDegS}°/s and ${pace.peakDegS2}°/s², ${design.servos.names[i]}`;
  });
}

function designText(design: MotionDesign, name: string, heightMm: number): string {
  const { servos } = design;

  return [
    `Fitted ${plural(design.skeleton.joints.length, 'joint')} to ${name} at ${heightMm} mm tall: the fewest that keep every point of each moving limb within ${lengthLabel(design.toleranceMm)} of the clip. The skeleton is posed as the clip's first frame and replaces any skeleton; one servo per joint is placed at its joint.`,
    ...limbLines(design),
    'Joints:',
    ...jointLines(design),
    `Servos at ${r1(servos.volts)} V from ${servos.rail}: ${usd(servos.servosUsd)}, ${usd(servos.costUsd)} with the battery, regulator and bus adapter. Each turns faster than its joint's peak at that joint's load.`,
    'Design the body on this skeleton next: define_skeleton edits it, and define_joints takes each joint by id.',
  ].join('\n');
}

export async function skeletonFromMotionRequest(
  payload: MotionPayload,
  ctx: MotionToolContext,
): Promise<{ text: string }> {
  const request = readRequest(payload);

  if (typeof request === 'string') return { text: request };

  const read = await readBvh(payload);

  if ('error' in read) return { text: read.error };

  const { mocap, name } = read;
  const result = await ctx.solve({ clip: clipOf(mocap), request });

  if (!('design' in result)) return { text: result.problem };

  placeMotionDesign(result.design, name, ctx);

  return { text: designText(result.design, name, request.heightMm) };
}
