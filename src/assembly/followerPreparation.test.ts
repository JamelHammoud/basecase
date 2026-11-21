import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import * as mass from '../utils/engineeringMass';
import { fastenerCarriers, fastenerMounts, withFastenerFollowers, type Clamps } from './followers';

const joint = (id: string, parent: string[], child: string[]): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent,
  child,
  origin: [0, 0, 0],
  axis: [0, 1, 0],
});

const fixture = () => ({
  joints: [
    joint('root', ['base'], ['body']),
    { ...joint('arm', ['body'], ['hand']), actuators: ['servo'], parentJoint: 'root' },
    joint('tie', ['body'], ['hand']),
    joint('other', ['otherBase'], ['otherBody']),
  ],
  clamps: {
    moving: ['hand', 'servo'],
    nut: ['@moving'],
    fixed: ['base', 'cap'],
    insert: ['@fixed'],
    bodyScrew: ['body', 'cap'],
    empty: [],
    servoOnly: ['servo'],
    dangling: ['@missing'],
    body: ['hand'],
    otherScrew: ['otherBody'],
  } satisfies Clamps,
});

afterEach(() => vi.restoreAllMocks());

describe('fastener assignment preparation', () => {
  it('preserves deepest carriers, first ties, fixed sides and indirect followers across edits', () => {
    const { joints, clamps } = fixture();
    const original = structuredClone({ joints, clamps });
    const moving = { moving: 'arm', otherScrew: 'other', nut: 'arm' };
    const fixed = { fixed: 'root', bodyScrew: 'arm', insert: 'root' };
    const followed = withFastenerFollowers(joints, clamps);

    expect(Object.fromEntries(fastenerCarriers(joints, clamps))).toEqual(moving);
    expect(Object.fromEntries(fastenerMounts(joints, clamps))).toEqual(fixed);
    expect(followed[0].parent).toEqual(['base', 'fixed', 'insert']);
    expect(followed[1].parent).toEqual(['body', 'bodyScrew']);
    expect(followed[1].child).toEqual(['hand', 'moving', 'nut']);
    expect(followed[2]).toBe(joints[2]);
    expect(followed[3].child).toEqual(['otherBody', 'otherScrew']);
    expect({ joints, clamps }).toEqual(original);

    joints[1] = { ...joints[1], child: ['replacement'] };
    clamps.moving = ['replacement', 'servo'];

    const edited = withFastenerFollowers(joints, clamps);

    expect(edited[1].child).toEqual(['replacement', 'moving', 'nut']);
    expect(followed[1].child).toEqual(['hand', 'moving', 'nut']);
    expect(withFastenerFollowers(joints, null)).toBe(joints);
    expect(withFastenerFollowers(joints, {})).toBe(joints);
    expect(fastenerMounts([], clamps).size).toBe(0);
  });

  it.each([30, 60])('prepares each of %i joint reaches once per public assignment', (count) => {
    const joints = Array.from({ length: count }, (_, i) => joint(`j${i}`, [`base${i}`], [`body${i}`]));
    const clamps = Object.fromEntries(
      joints.flatMap((_, i) => [
        [`moving${i}`, [`body${i}`]],
        [`fixed${i}`, [`base${i}`, 'cap']],
      ]),
    );
    const downstream = vi.spyOn(mass, 'downstreamOf');
    const followed = withFastenerFollowers(joints, clamps);

    expect(downstream).toHaveBeenCalledTimes(count);
    expect(followed.every((j, i) => j.child[1] === `moving${i}` && j.parent[1] === `fixed${i}`)).toBe(true);
    downstream.mockClear();
    expect(fastenerMounts(joints, clamps).size).toBe(count);
    expect(downstream).toHaveBeenCalledTimes(count);
    downstream.mockClear();
    expect(fastenerCarriers(joints, clamps).size).toBe(count);
    expect(downstream).toHaveBeenCalledTimes(count);
  });
});
