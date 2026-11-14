import { describe, expect, it } from 'vitest';
import { toScene } from '../agent/agentFrame';
import { findPort, worldPort } from '../agent/ports';
import type { MotionDesign } from '../utils/motionDesign';
import { motionBuild } from './motionBuild';

const STS3215 = 'component:feetech-sts3215|c018';

const design = {
  skeleton: {
    joints: [
      { id: 'neck_yaw', origin: [10, 20, 300], axis: [0, 0, 1], range: [-40, 40], actuator: STS3215 },
      {
        id: 'neck_pitch',
        parent: 'neck_yaw',
        origin: [10, 20, 300],
        axis: [1, 0, 0],
        range: [-30, 30],
        actuator: STS3215,
      },
    ],
    replace: true,
  },
} as unknown as MotionDesign;

describe('motionBuild', () => {
  it('puts each servo’s output shaft on its joint’s axis, framed to the joint', () => {
    const { parts, skeleton } = motionBuild(design, 'Nod', { parts: () => [], skeleton: () => undefined });

    expect(parts.map((p) => [p.id, p.frame, p.group?.name])).toEqual([
      ['neck_yaw-servo', 'neck_yaw', 'Nod'],
      ['neck_pitch-servo', 'neck_pitch', 'Nod'],
    ]);

    parts.forEach((part, i) => {
      const shaft = worldPort(part, findPort(part, 'output')!);
      const joint = skeleton.joints[i];

      shaft.position.forEach((v, k) => expect(v).toBeCloseTo(toScene(joint.origin)[k], 0));
      shaft.axis.forEach((v, k) => expect(v).toBeCloseTo(toScene(joint.axis)[k], 2));
    });
  });
});
