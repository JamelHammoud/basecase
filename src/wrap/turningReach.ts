import type { Bounds } from './vec';
import type { V3, WrapJoint } from './wrapTypes';

function slidingReach(joint: WrapJoint, moving: Bounds): Bounds {
  const min: V3 = [0, 0, 0];
  const max: V3 = [0, 0, 0];

  for (let k = 0; k < 3; k++) {
    const a = joint.range[0] * joint.axis[k];
    const b = joint.range[1] * joint.axis[k];
    const loA = moving.min[k] + a;
    const loB = moving.min[k] + b;
    const hiA = moving.max[k] + a;
    const hiB = moving.max[k] + b;

    min[k] = Math.min(loA, loB, hiA, hiB);
    max[k] = Math.max(loA, loB, hiA, hiB);
  }

  return { min, max };
}

export function turningReach(joint: WrapJoint, moving: Bounds | null): Bounds | null {
  if (!moving) return null;

  if (joint.type === 'prismatic') return slidingReach(joint, moving);

  let radius = -Infinity;

  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? moving.max[0] : moving.min[0]) - joint.origin[0];
    const y = (i & 2 ? moving.max[1] : moving.min[1]) - joint.origin[1];
    const z = (i & 4 ? moving.max[2] : moving.min[2]) - joint.origin[2];

    radius = Math.max(radius, Math.hypot(x, y, z));
  }

  return { min: joint.origin.map((v) => v - radius) as V3, max: joint.origin.map((v) => v + radius) as V3 };
}
