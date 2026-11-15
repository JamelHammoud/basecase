import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { box, joint, part, project } from './engineering.fixtures';
import { crouchModel } from './engineeringCrouch';
import { dot, norm, type V3 } from './engineeringMath';
import type { CheckContext } from './engineeringTypes';
import { nameWords } from './jointNames';

function context(joints: RobotJoint[]): CheckContext {
  const foot = part('foot');
  const parts = [foot];
  const settings = project({ joints });
  const measures = { foot: box([-10, 0, -10], [10, 10, 10]) };
  const mass = { grams: 1000, com: [0, 200, 0] as V3 };

  return {
    input: { parts, project: settings, measures, servoOutputs: {} },
    parts,
    project: settings,
    measures,
    joints,
    byPart: new Map([['foot', foot]]),
    byId: new Map(),
    all: mass,
    onFloor: parts,
    servos: [],
    bodies: [{ key: 'leg', joints, parts: new Set(['foot']), mass, legged: true, feet: parts }],
  };
}

const leg = (axes: V3[]) =>
  axes.map((axis, i) =>
    joint(`j${i}`, {
      name: i % 3 === 1 ? 'left_knee' : `hip${i}`,
      axis,
      origin: [0, 1000 - i * 10, 0],
      parent: ['body'],
      child: ['foot'],
      limb: 'leg',
    }),
  );

function previousPitch(chain: RobotJoint[]) {
  const sets = chain
    .filter((j) => Math.abs(norm(j.axis)[1]) < 0.44)
    .map((j) => {
      const axis = norm(j.axis);
      const members = chain.filter((k) => Math.abs(dot(norm(k.axis), axis)) >= 0.9);
      const knee = members.some((k) => nameWords(k.name).some((w) => /^[lr]?(knee|kfe|calf|shin)[lr]?\d*$/.test(w)));

      return { members, score: members.length * 4 + (knee ? 2 : 0) + Math.abs(axis[0]) };
    });

  return (sets.sort((a, b) => b.score - a.score)[0]?.members ?? []).sort((a, b) => b.origin[1] - a.origin[1]);
}

function expectedLevers(pitch: RobotJoint[]) {
  const out = new Map<string, number>();
  const heights = pitch.map((j) => j.origin[1]);

  if (pitch.length < 2) return out;

  if (pitch.length === 2) heights.push(0);

  for (let i = 0; i < heights.length - 1; i++) {
    let lever = 0;

    for (let k = heights.length - 2; k >= i; k--)
      lever += (-1) ** (heights.length - 2 - k) * (heights[k] - heights[k + 1]);

    out.set(pitch[i].id, lever);
  }

  if (pitch.length >= 3) out.set(pitch[pitch.length - 1].id, 0);

  return out;
}

function compare(joints: RobotJoint[]) {
  const before = structuredClone(joints);
  const pitch = previousPitch(joints);
  const actual = crouchModel(context(joints));
  const knee = pitch[pitch.length >= 3 ? pitch.length - 2 : pitch.length - 1];

  expect(actual.levers).toEqual(expectedLevers(pitch));
  expect(actual.knees).toEqual(new Set(pitch.length >= 2 ? [knee.id] : []));
  expect(actual).toMatchObject({ crouchDeg: 30, fromGait: false, legs: joints.length ? 1 : 0, share: 1 });
  expect(joints).toEqual(before);
}

describe('crouch pitch axes', () => {
  it('preserves parallel groups, knee ties, threshold boundaries and source order', () => {
    const pool: V3[] = [
      [1, 0, 0],
      [-7, 0, 0],
      [0, 0, 5],
      [0, 9, 0],
      [0, 0, 0],
      [0.9, 0, Math.sqrt(0.19)],
      [Math.sqrt(1 - 0.44 ** 2), 0.44, 0],
      [1, 0.4899, 0],
      [1, 0.49, 0],
      [NaN, 0, 0],
      [Infinity, 0, 1],
    ];

    compare([]);

    for (let n = 1; n <= 24; n++)
      for (let shift = 0; shift < pool.length; shift++) {
        const joints = leg(Array.from({ length: n }, (_, i) => pool[(i * 7 + shift) % pool.length]));

        compare(joints);
        compare([...joints].reverse());
      }
  });

  it('reads edited axes afresh and keeps earlier results independent', () => {
    const joints = leg([
      [1, 0, 0],
      [-2, 0, 0],
      [0, 0, 3],
      [0, 0, 1],
    ]);
    const first = crouchModel(context(joints));
    const before = structuredClone(first);

    joints[0].axis = [0, 0, -4];
    joints[1].axis = [0, 5, 0];
    compare(joints);
    expect(crouchModel(context(joints))).not.toEqual(first);
    expect(first).toEqual(before);
  });

  it.each([30, 60])('reads each source axis once for a %i-joint chain', (count) => {
    const joints = leg(Array.from({ length: count }, () => [2, 0, 0]));
    let reads = 0;

    for (const j of joints) Object.defineProperty(j, 'axis', { get: () => (reads++, [2, 0, 0]) });

    previousPitch(joints);
    expect(reads).toBe(count * count + 2 * count);
    reads = 0;

    const result = crouchModel(context(joints));

    expect(reads).toBe(count);
    expect(result.levers.size).toBe(count);
    expect(result.knees).toEqual(new Set([`j${count - 2}`]));
  });
});
