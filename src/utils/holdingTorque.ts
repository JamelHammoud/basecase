import { HOLD_LIMITS } from './actuatorRules';
import { dot, type V3 } from './engineeringMath';

export const HOLD_LIMIT = HOLD_LIMITS.warn;

export interface JointAxis {
  anchor: V3;
  axis: V3;
  revolute: boolean;
}

export function holdTorque(joint: JointAxis, point: V3, force: V3): number {
  if (!joint.revolute) return -dot(force, joint.axis);

  const dx = point[0] - joint.anchor[0];
  const dy = point[1] - joint.anchor[1];
  const dz = point[2] - joint.anchor[2];
  const cx = dy * force[2] - dz * force[1];
  const cy = dz * force[0] - dx * force[2];
  const cz = dx * force[1] - dy * force[0];

  return -(cx * joint.axis[0] + cy * joint.axis[1] + cz * joint.axis[2]);
}

export function liftableKg(holdNm: number, perKgNm: number, limitNm: number): number {
  if (Math.abs(holdNm) > limitNm) return 0;

  if (Math.abs(perKgNm) < 1e-9) return Infinity;

  return (limitNm - Math.sign(perKgNm) * holdNm) / Math.abs(perKgNm);
}
