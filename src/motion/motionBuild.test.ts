import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { toScene } from '../agent/agentFrame';
import { findPort, worldPort } from '../agent/ports';
import { buildSkeleton } from '../agent/skeleton';
import { buildBom } from '../utils/bom';
import { motionBuild } from './motionBuild';

const skeleton = buildSkeleton({
  mass_g: 450,
  joints: [
    {
      id: 'shoulder',
      origin: [20, 40, 150],
      axis: [1, 2, 3],
      actuator: 'component:feetech-sts3215|c001',
      link_mass_g: 45,
      range: [-40, 70],
    },
    {
      id: 'elbow',
      parent: 'shoulder',
      origin: [60, 45, 250],
      axis: [-1, 0, 0],
      actuator: 'component:dynamixel-xl330-m288',
      tip: [85, 30, 300],
      link_mass_g: 35,
      range: [-70, 80],
    },
  ],
}).skeleton;

describe('motion skeleton placement', () => {
  it('places one catalog servo at each joint output, preserves its plan and lists every servo in the BOM', () => {
    const built = motionBuild(skeleton, new Set(['motion-shoulder-servo']));
    const bom = buildBom({
      parts: built.parts,
      project: { printer: 'default', material: 'PLA', infillPct: 20, skeleton: built.skeleton },
      purchases: {},
      measures: {},
    });

    expect(built.skeleton).toEqual(skeleton);
    expect(new Set(built.parts.map((p) => p.id)).size).toBe(2);
    expect(built.parts.map((p) => p.id)).not.toContain('motion-shoulder-servo');

    for (const joint of skeleton.joints) {
      const servo = built.parts.find((p) => p.frame === joint.id)!;
      const output = worldPort(servo, findPort(servo, 'output')!);

      expect(new Vector3(...output.position).distanceTo(new Vector3(...toScene(joint.origin)))).toBeLessThan(1e-8);
      expect(new Vector3(...output.axis).dot(new Vector3(...toScene(joint.axis)).normalize())).toBeGreaterThan(
        0.999999,
      );
      expect(servo.kind).toBe('component');
    }

    expect(bom.lines.filter((l) => l.category === 'Components').reduce((n, l) => n + l.qty, 0)).toBe(2);
  });

  it('refuses a servo without an output frame instead of placing an approximate stand-in', () => {
    const broken = { ...skeleton, joints: [{ ...skeleton.joints[0], actuator: 'component:raspberry-pi-5' }] };

    expect(() => motionBuild(broken, new Set())).toThrow();
  });
});
