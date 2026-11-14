import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { uniqueJointIds } from './kinematics';

const joint = (id: string, fields: Partial<RobotJoint> = {}): RobotJoint => ({
  id,
  name: id,
  type: 'fixed',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 1, 0],
  ...fields,
});

describe('uniqueJointIds', () => {
  it('keeps the original list when no joint needs renaming', () => {
    const joints = [joint('shoulder'), joint('wrist', { parentJoint: 'shoulder' })];
    const empty: RobotJoint[] = [];

    expect(uniqueJointIds(joints, new Set(['other']))).toBe(joints);
    expect(uniqueJointIds(empty)).toBe(empty);
  });

  it('skips occupied suffixes for a whole batch and keeps external parent links', () => {
    const joints = [
      joint('shoulder'),
      joint('wrist', { parentJoint: 'shoulder' }),
      joint('tool', { parentJoint: 'external' }),
    ];
    const before = structuredClone(joints);
    const out = uniqueJointIds(joints, new Set(['shoulder', 'wrist_2', 'tool_3']));

    expect(out.map((j) => j.id)).toEqual(['shoulder_4', 'wrist_4', 'tool_4']);
    expect(out[1].parentJoint).toBe('shoulder_4');
    expect(out[2].parentJoint).toBe('external');
    expect(joints).toEqual(before);
  });

  it('starts a fresh batch at every repeated id, including consecutive repeats', () => {
    const joints = [joint('a'), joint('b'), joint('a'), joint('a'), joint('b')];
    const out = uniqueJointIds(joints);

    expect(out.map((j) => j.id)).toEqual(['a', 'b', 'a_2', 'a_3', 'b_3']);
    expect(out[0]).toBe(joints[0]);
    expect(out[1]).toBe(joints[1]);
  });

  it('renames linkage drivers inside the batch and keeps drivers outside it', () => {
    const loop: NonNullable<RobotJoint['loop']> = {
      driver: 'crank',
      link: 'coupler',
      fourBar: { ground: 100, crank: 20, coupler: 80, rocker: 60, theta: 0 },
    };
    const joints = [
      joint('crank'),
      joint('coupler', { parentJoint: 'crank', loop }),
      joint('external', { loop: { ...loop, driver: 'other-robot' } }),
    ];
    const out = uniqueJointIds([...joints, ...joints]);

    expect(out[4]).toMatchObject({ id: 'coupler_2', parentJoint: 'crank_2', loop: { ...loop, driver: 'crank_2' } });
    expect(out[5].loop).toBe(joints[2].loop);
    expect(joints[1].loop?.driver).toBe('crank');
  });

  it('checks batch membership with work proportional to the imported joint count', () => {
    const size = 600;
    let idReads = 0;
    const joints = Array.from({ length: size * 2 }, (_, i) => {
      const id = `joint-${i % size}`;

      return {
        ...joint(id, { parentJoint: i % size ? `joint-${(i % size) - 1}` : undefined }),
        get id() {
          idReads++;

          return id;
        },
      };
    });
    const out = uniqueJointIds(joints);

    expect(idReads).toBeLessThan(joints.length * 20);
    expect(out.map((j) => j.id)).toEqual([
      ...Array.from({ length: size }, (_, i) => `joint-${i}`),
      ...Array.from({ length: size }, (_, i) => `joint-${i}_2`),
    ]);
    expect(out[size + 1].parentJoint).toBe('joint-0_2');
  });
});
