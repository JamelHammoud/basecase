import type { ScenePart } from '../types/robotics';

const NO_DEFORM_EPSILON = { taper: 0.001, bend: 0.1, twist: 0.1, round: 0.001 };

export function hasDeformers(part: Pick<ScenePart, 'deformers'>): boolean {
  const d = part.deformers;

  if (!d) {
    return false;
  }

  return (
    Math.abs(d.taper || 0) > NO_DEFORM_EPSILON.taper ||
    Math.abs(d.bendDeg || 0) > NO_DEFORM_EPSILON.bend ||
    Math.abs(d.twistDeg || 0) > NO_DEFORM_EPSILON.twist ||
    (d.roundness || 0) > NO_DEFORM_EPSILON.round
  );
}
