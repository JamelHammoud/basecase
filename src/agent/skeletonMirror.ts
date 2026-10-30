import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton } from '../types/skeleton';
import { r1, r3, toScene, type V3 } from './agentFrame';
import { mirrorPoint, pairAxis } from './skeleton';

export interface SkeletonMirrorResult {
  copies: ScenePart[];
  notes: string[];
}

const SHIFT_NOTE_MM = 0.05;

function partnerOf(skeleton: RobotSkeleton, id: string, axis: 'x' | 'y'): string | undefined {
  const pair = skeleton.pairs.find((p) => p.includes(id) && pairAxis(p) === axis);

  if (!pair) return undefined;

  return pair[0] === id ? pair[1] : pair[0];
}

function onPlane(skeleton: RobotSkeleton, id: string, axis: 'x' | 'y') {
  const j = skeleton.joints.find((k) => k.id === id);

  return !!j && Math.abs(j.origin[axis === 'x' ? 0 : 1]) < 0.5;
}

function placed(copy: ScenePart, skeleton: RobotSkeleton, axis: 'x' | 'y'): { part: ScenePart; note?: string } {
  const frame = copy.frame!;
  const partner = partnerOf(skeleton, frame, axis);
  const src = skeleton.joints.find((j) => j.id === frame);
  const dst = partner ? skeleton.joints.find((j) => j.id === partner) : undefined;

  if (!src || !dst) return { part: onPlane(skeleton, frame, axis) ? copy : { ...copy, frame: undefined } };

  const shift = toScene(dst.origin.map((v, k) => v - mirrorPoint(src.origin, axis)[k]) as V3);
  const off = Math.hypot(...shift);
  const part = {
    ...copy,
    frame: dst.id,
    position: copy.position.map((v, k) => r3(v + shift[k])) as V3,
  };

  return {
    part,
    note:
      off > SHIFT_NOTE_MM
        ? `${copy.id} placed on the ${dst.id} joint, ${r1(off)} mm from the plain mirror.`
        : undefined,
  };
}

export function alignToSkeleton(
  copies: ScenePart[],
  skeleton: RobotSkeleton | undefined,
  axis: 'x' | 'y' | 'z',
): SkeletonMirrorResult {
  if (!skeleton || axis === 'z')
    return { copies: copies.map((c) => (c.frame ? { ...c, frame: undefined } : c)), notes: [] };

  const out = copies.map((c) => (c.frame ? placed(c, skeleton, axis) : { part: c }));

  return { copies: out.map((o) => o.part), notes: out.flatMap((o) => (o.note ? [o.note] : [])) };
}
