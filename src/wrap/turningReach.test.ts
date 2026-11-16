import { describe, expect, it } from 'vitest';
import { merged } from './fieldSolid';
import { turningReach } from './turningReach';
import type { Bounds } from './vec';
import type { V3, WrapJoint } from './wrapTypes';

function cornerReach(joint: WrapJoint, moving: Bounds | null): Bounds | null {
  if (!moving) return null;

  const corners = Array.from({ length: 8 }, (_, i) =>
    [0, 1, 2].map((k) => ((i >> k) & 1 ? moving.max[k] : moving.min[k])),
  ) as V3[];

  if (joint.type === 'prismatic') {
    const ends = corners.flatMap((c) => joint.range.map((d) => c.map((v, k) => v + d * joint.axis[k]) as V3));

    return merged(ends.map((c) => ({ min: c, max: c })));
  }

  const radius = Math.max(...corners.map((c) => Math.hypot(...c.map((v, k) => v - joint.origin[k]))));

  return { min: joint.origin.map((v) => v - radius) as V3, max: joint.origin.map((v) => v + radius) as V3 };
}

const jointOf = (type: WrapJoint['type']): WrapJoint => ({
  id: 'joint',
  type,
  origin: [4, -7, 9],
  axis: [0.6, -0.8, 0],
  range: [-30, 80],
  parentLink: 'base',
  floor: false,
});

describe('shell joint reach', () => {
  it.each(['revolute', 'prismatic'] as const)('matches corner enumeration for %s motion and later edits', (type) => {
    const joint = jointOf(type);

    for (let i = 0; i < 150; i++) {
      const min: V3 = [Math.sin(i) * 900, Math.cos(i * 3) * 400, -i];
      const max = min.map((v, k) => v + ((i * (k + 7)) % 113)) as V3;
      const moving = { min, max };
      const snapshot = structuredClone({ joint, moving });

      expect(turningReach(joint, moving)).toEqual(cornerReach(joint, moving));
      expect({ joint, moving }).toEqual(snapshot);
      joint.origin[i % 3] += 0.75;
      joint.axis[i % 3] = Math.sin(i * 0.2);
      joint.range.reverse();
      moving.max[0] += 10;
      expect(turningReach(joint, moving)).toEqual(cornerReach(joint, moving));
    }
  });

  it.each(['revolute', 'prismatic'] as const)('preserves absent and nonfinite %s bounds', (type) => {
    const joint = jointOf(type);
    const values = [-Infinity, -1e300, -0, 0, 1e-300, 1e300, Infinity, NaN];

    expect(turningReach(joint, null)).toBeNull();

    for (const value of values) {
      const moving: Bounds = { min: [value, -0, -12], max: [value, 0, 12] };

      expect(turningReach(joint, moving)).toEqual(cornerReach(joint, moving));
      joint.range = [value, -value];
      expect(turningReach(joint, moving)).toEqual(cornerReach(joint, moving));
      joint.origin = [value, value, value];
      expect(turningReach(joint, moving)).toEqual(cornerReach(joint, moving));
    }
  });

  it('returns independent coordinates and reads each slider axis twice', () => {
    const joint = jointOf('prismatic');
    const moving: Bounds = { min: [-10, -20, -30], max: [10, 20, 30] };
    const expected = cornerReach(joint, moving);
    let reads = 0;

    joint.axis = new Proxy(joint.axis, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^[0-2]$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });

    const first = turningReach(joint, moving)!;

    expect(reads).toBe(6);
    expect(first).toEqual(expected);
    first.min[0] = 1234;
    expect(turningReach(joint, moving)).toEqual(expected);
    expect(moving.min).toEqual([-10, -20, -30]);
  });
});
