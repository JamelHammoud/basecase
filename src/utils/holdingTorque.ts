import { HOLD_LIMITS } from './actuatorRules';
import { cross, dot, sub, type V3 } from './engineeringMath';

export const HOLD_LIMIT = HOLD_LIMITS.warn;

export interface JointAxis {
  anchor: V3;
  axis: V3;
  revolute: boolean;
}

export function holdTorque(joint: JointAxis, point: V3, force: V3): number {
  if (!joint.revolute) return -dot(force, joint.axis);

  return -dot(cross(sub(point, joint.anchor), force), joint.axis);
}

export function liftableKg(holdNm: number, perKgNm: number, limitNm: number): number {
  if (Math.abs(holdNm) > limitNm) return 0;

  if (Math.abs(perKgNm) < 1e-9) return Infinity;

  return (limitNm - Math.sign(perKgNm) * holdNm) / Math.abs(perKgNm);
}
