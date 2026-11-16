import { describe, expect, it } from 'vitest';
import { robotWeight } from './engineering';
import { biped, box, part, project } from './engineering.fixtures';
import { crouchModel } from './engineeringCrouch';
import { cross, dot, G, norm, sub, type V3 } from './engineeringMath';
import { downstreamOf, massOf } from './engineeringMass';
import { jointLoad } from './engineeringTorque';
import type { CheckContext } from './engineeringTypes';
import type { RobotJoint } from '../types/robotics';

function previousStance(ctx: CheckContext, joint: RobotJoint): number {
  const down = downstreamOf(joint, ctx.joints);
  const feet = ctx.onFloor.filter((p) => down.has(p.id));

  if (!feet.length) return 0;

  const center = (axis: number) =>
    feet.reduce((sum, p) => sum + (ctx.measures[p.id]!.min[axis] + ctx.measures[p.id]!.max[axis]) / 2, 0) / feet.length;
  const distal = massOf(down, ctx.byId);
  const carried = ctx.bodies.find((body) => body.joints.includes(joint))?.mass.grams ?? ctx.all.grams;
  const share = crouchModel(ctx).shares.get(joint.id) ?? 1;
  const force: V3 = [0, ((carried * share) / 1000) * G, 0];
  const gravity: V3 = [0, (-distal.grams / 1000) * G, 0];
  const axis = norm(joint.axis);
  const reaction = dot(cross(sub([center(0), 0, center(2)], joint.origin), force), axis);
  const weight = dot(cross(sub(distal.com, joint.origin), gravity), axis);

  return Math.abs(reaction + weight) / 1000;
}

describe('stance contact accumulation', () => {
  it('retains exact loads across multiple contacts, unrelated feet, reordered contacts and later edits', () => {
    for (const facing of ['x', 'z'] as const) {
      const scene = biped({ facing });
      const extra = part('toe', { massG: 50 });

      scene.parts.push(extra);
      scene.measures.toe = box([-72, 0, 18], [-28, 20, 44]);
      scene.joints[2].child.push('toe');

      const settings = project({ joints: scene.joints });
      const input = { parts: scene.parts, project: settings, measures: scene.measures, servoOutputs: {} };
      const ctx: CheckContext = {
        ...input,
        input,
        ...robotWeight(input),
        joints: scene.joints,
        byPart: new Map(scene.parts.map((p) => [p.id, p])),
        onFloor: [],
        servos: [],
      };
      const contacts = [scene.parts[1], extra, scene.parts.find((p) => p.id === 'footR')!];

      for (const floor of [[], contacts.slice(0, 1), contacts, [...contacts].reverse(), [...contacts, extra]]) {
        ctx.onFloor = floor;

        for (const joint of scene.joints) {
          const before = structuredClone(input);
          const actual = jointLoad(ctx, joint, { crouch: crouchModel(ctx) });

          expect(actual.stanceNm).toBe(previousStance(ctx, joint));
          expect(input).toEqual(before);
        }

        scene.measures.toe = box([-80, 0, -46], [-24, 20, -12]);
      }
    }
  });
});
