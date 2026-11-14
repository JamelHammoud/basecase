import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { jointsWithoutParts } from './kinematics';

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

describe('jointsWithoutParts', () => {
  it('leaves the joint list untouched when no joint uses a deleted part', () => {
    const joints = [joint('wrist', { parent: ['forearm'], child: ['hand'] })];

    expect(jointsWithoutParts(undefined, new Set(['hand']))).toBeUndefined();
    expect(jointsWithoutParts(joints, new Set())).toBe(joints);
    expect(jointsWithoutParts(joints, new Set(['other']))).toBe(joints);
    expect(jointsWithoutParts([], new Set(['hand']))).toEqual([]);
  });

  it('removes moving sides that are gone and clears their surviving children’s parent joints', () => {
    const joints = [
      joint('elbow', { child: ['forearm'], parentJoint: 'shoulder' }),
      joint('wrist', { parent: ['forearm'], child: ['hand'], parentJoint: 'elbow' }),
      joint('shoulder'),
      joint('other', { child: ['other-part'] }),
    ];
    const before = structuredClone(joints);
    const remaining = jointsWithoutParts(joints, new Set(['forearm']))!;

    expect(remaining.map((j) => j.id)).toEqual(['wrist', 'other']);
    expect(remaining[0]).toMatchObject({ parent: [], child: ['hand'], parentJoint: undefined });
    expect(joints).toEqual(before);
  });

  it('keeps partial moving sides and clears only deleted mounts, actuators and frames', () => {
    const frame = { part: 'mount', origin: [1, 2, 3], axis: [0, 1, 0] } satisfies RobotJoint['frame'];
    const joints = [
      joint('wrist', {
        parent: ['mount', 'base'],
        child: ['finger', 'palm'],
        actuators: ['servo', 'spare'],
        frame,
      }),
      joint('other', { child: ['hand'], frame: { ...frame, part: 'base' } }),
    ];
    const remaining = jointsWithoutParts(joints, new Set(['mount', 'finger', 'servo']))!;

    expect(remaining[0]).toMatchObject({
      parent: ['base'],
      child: ['palm'],
      actuators: ['spare'],
      frame: undefined,
    });
    expect(remaining[1].frame).toBe(joints[1].frame);
    expect(joints[0].frame).toBe(frame);
  });

  it('keeps supporting ancestors and cycles while removing abandoned branches in scene order', () => {
    const joints = [
      joint('unused-root'),
      joint('live-tip', { child: ['hand'], parentJoint: 'live-root' }),
      joint('unused-tip', { parentJoint: 'unused-root' }),
      joint('live-root'),
      joint('cycle-a', { parentJoint: 'cycle-b' }),
      joint('cycle-b', { parentJoint: 'cycle-a' }),
      joint('self', { parentJoint: 'self' }),
      joint('trigger', { child: ['removed'] }),
    ];

    expect(jointsWithoutParts(joints, new Set(['removed']))!.map((j) => j.id)).toEqual([
      'live-tip',
      'live-root',
      'cycle-a',
      'cycle-b',
      'self',
    ]);
  });

  it('prunes both empty joints sharing an id only after their last dependent is gone', () => {
    const joints = [
      joint('root'),
      joint('root'),
      joint('tip-a', { parentJoint: 'root' }),
      joint('tip-b', { parentJoint: 'root' }),
      joint('trigger', { child: ['removed'] }),
    ];

    expect(jointsWithoutParts(joints, new Set(['removed']))).toEqual([]);
    expect(
      jointsWithoutParts(
        [...joints, joint('live', { parentJoint: 'root', child: ['hand'] })],
        new Set(['removed']),
      )!.map((j) => j.id),
    ).toEqual(['root', 'root', 'live']);
  });

  it('cleans a deep abandoned chain with work proportional to its joint count', () => {
    const size = 600;
    let lengthReads = 0;
    const trackedIds = (ids: string[]): string[] =>
      new Proxy(ids, {
        get(target, key, receiver) {
          if (key === 'length') lengthReads++;

          if (key === 'filter') return (keep: (id: string) => boolean) => trackedIds(target.filter(keep));

          return Reflect.get(target, key, receiver);
        },
      });
    const joints = Array.from({ length: size }, (_, i) =>
      joint(`joint-${i}`, {
        parentJoint: i ? `joint-${i - 1}` : undefined,
        parent: trackedIds(i ? [] : ['removed']),
      }),
    );

    expect(jointsWithoutParts(joints, new Set(['removed']))).toEqual([]);
    expect(lengthReads).toBeLessThan(size * 20);
  });
});
