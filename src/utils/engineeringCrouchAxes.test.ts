import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { box, joint, part, project } from './engineering.fixtures';
import { crouchModel } from './engineeringCrouch';
import { dot, norm, type V3 } from './engineeringMath';
import type { CheckContext } from './engineeringTypes';
import { nameWords } from './jointNames';
import { seededRandom } from './seededRandom';

const foot = part('foot');
const mass = { grams: 1000, com: [0, 100, 0] as V3 };

function contextFor(joints: RobotJoint[]): CheckContext {
  const parts = [foot];
  const settings = project({ joints });
  const measures = { foot: box([-20, 0, -20], [20, 10, 20]) };

  return {
    input: { parts, project: settings, measures, servoOutputs: {} },
    parts,
    project: settings,
    measures,
    joints,
    byPart: new Map([[foot.id, foot]]),
    byId: new Map(),
    all: mass,
    onFloor: [foot],
    servos: [],
    bodies: [{ key: 'leg', joints, parts: new Set(['foot']), mass, legged: true, feet: [foot] }],
  };
}

function chainOf(axes: V3[]): RobotJoint[] {
  return axes.map((axis, i) =>
    joint(`joint${i}`, {
      name: i % 3 === 1 ? 'Left knee' : `Leg joint ${i}`,
      axis,
      limb: 'leg',
      parent: ['torso'],
      child: ['foot'],
      origin: [0, (axes.length - i) * 30, 0],
    }),
  );
}

function previousPitch(chain: RobotJoint[]): RobotJoint[] {
  const sets = chain
    .filter((j) => Math.abs(norm(j.axis)[1]) < 0.44)
    .map((j) => {
      const axis = norm(j.axis);
      const members = chain.filter((k) => Math.abs(dot(norm(k.axis), axis)) >= 0.9);
      const knee = members.some((k) => nameWords(k.name).some((w) => /^[lr]?(knee|kfe|calf|shin)[lr]?\d*$/.test(w)));

      return { members, score: members.length * 4 + (knee ? 2 : 0) + Math.abs(axis[0]) };
    });

  return sets.sort((a, b) => b.score - a.score)[0]?.members ?? [];
}

function previousLevers(joints: RobotJoint[]) {
  const pitch = previousPitch(joints).sort((a, b) => b.origin[1] - a.origin[1]);
  const levers = new Map<string, number>();
  const knees = new Set<string>();

  if (pitch.length < 2) return { levers, knees };

  const heights = pitch.map((j) => j.origin[1]);
  const flatFoot = pitch.length >= 3;

  if (!flatFoot) heights.push(0);

  let offset = 0;
  let sign = 1;

  for (let i = heights.length - 2; i >= 0; i--) {
    offset += sign * (heights[i] - heights[i + 1]);
    sign = -sign;
    levers.set(pitch[i].id, offset);
  }

  if (flatFoot) levers.set(pitch[pitch.length - 1].id, 0);

  knees.add(pitch[flatFoot ? pitch.length - 2 : pitch.length - 1].id);

  return { levers, knees };
}

const axes: V3[] = [
  [1, 0, 0],
  [-7, 0, 0],
  [0, 0, 3],
  [0, 9, 0],
  [0, 0, 0],
  [0.9, 0, Math.sqrt(1 - 0.9 ** 2)],
  [0.9 - 1e-12, 0, Math.sqrt(1 - (0.9 - 1e-12) ** 2)],
  [Math.sqrt(1 - 0.44 ** 2), 0.44, 0],
  [Math.sqrt(1 - (0.44 - 1e-12) ** 2), 0.44 - 1e-12, 0],
  [NaN, 0, 0],
  [Infinity, 1, 0],
];

describe('crouch pitch grouping', () => {
  it('keeps knees and lever lengths across mixed, scaled and boundary axes', () => {
    const random = seededRandom('0123456789abcdef0123456789abcdef');
    const cases = [[], ...axes.map((axis) => [axis, axis]), axes];

    for (let i = 0; i < 200; i++) {
      const sample = Array.from(
        { length: 2 + Math.floor(random() * 12) },
        () => axes[Math.floor(random() * axes.length)],
      );

      cases.push(sample);
    }

    for (const sample of cases) {
      const joints = chainOf(sample);
      const before = structuredClone(joints);
      const ctx = contextFor(joints);
      const model = crouchModel(ctx);

      expect(model).toMatchObject(previousLevers(joints));
      expect(crouchModel(ctx)).toEqual(model);
      expect(joints).toEqual(before);
    }
  });

  it('preserves first-candidate ties and reads edited axes without changing prior results', () => {
    const joints = chainOf([
      [0.6, 0, 0.8],
      [0.6, 0, 0.8],
      [0.6, 0, -0.8],
      [0.6, 0, -0.8],
    ]);

    joints.forEach((j) => (j.name = 'Leg joint'));

    const ctx = contextFor(joints);
    const first = crouchModel(ctx);

    expect([...first.knees]).toEqual(['joint1']);
    expect([...first.levers.keys()]).toEqual(['joint1', 'joint0']);
    joints[0].axis = [0, 1, 0];
    joints[1].axis = [0, 1, 0];

    const edited = crouchModel(ctx);

    expect([...edited.knees]).toEqual(['joint3']);
    expect(edited).toMatchObject(previousLevers(joints));
    expect([...first.knees]).toEqual(['joint1']);
    expect([...first.levers.keys()]).toEqual(['joint1', 'joint0']);
  });

  it.each([300, 600])('reads each source axis once in a %i-joint chain', (count) => {
    const joints = chainOf(Array.from({ length: count }, (): V3 => [2, 0, 0]));
    let reads = 0;

    for (const j of joints)
      Object.defineProperty(j, 'axis', {
        get() {
          reads++;

          return [2, 0, 0];
        },
      });

    const expected = previousLevers(joints);

    expect(reads).toBe(count * (count + 2));
    reads = 0;

    const actual = crouchModel(contextFor(joints));

    expect(actual).toMatchObject(expected);
    expect(reads).toBe(count);
  });
});
