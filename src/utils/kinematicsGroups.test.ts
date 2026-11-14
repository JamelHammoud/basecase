import { describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, forwardKinematics, partMotion } from './kinematics';

const part = (id: string, group?: string, role: ScenePart['role'] = 'solid'): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role,
  position: [10, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  group: group === undefined ? undefined : { id: group, name: group },
});

const joint = (id: string, fields: Partial<RobotJoint> = {}): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  ...fields,
});

describe('grouped rig parts', () => {
  it('moves every unlisted group member with its sole link regardless of scene order', () => {
    const parts = [part('cover', 'hand'), part('palm', 'hand'), part('sensor', 'hand', 'reference')];
    const rig = buildRig([joint('wrist', { child: ['palm'] })], parts);
    const posed = forwardKinematics(rig, { values: { wrist: 90 } });

    expect([...rig.ownerOf]).toEqual([
      ['palm', 'wrist'],
      ['cover', 'wrist'],
      ['sensor', 'wrist'],
    ]);
    expect(rig.robots[0].parts).toEqual(new Set(parts.map((p) => p.id)));
    expect(partMotion(rig, posed, 'cover')?.elements).toEqual(partMotion(rig, posed, 'palm')?.elements);
    expect(buildRig(rig.joints, [...parts].reverse()).ownerOf).toEqual(rig.ownerOf);
  });

  it('keeps base mounts and multi-link groups out of inferred link ownership', () => {
    const parts = [
      part('base-cover', 'base'),
      part('base', 'base'),
      part('upper', 'arm'),
      part('forearm', 'arm'),
      part('arm-cover', 'arm'),
      part('reference', 'base', 'reference'),
      part('ungrouped'),
      part('unconnected', 'other'),
    ];
    const rig = buildRig(
      [
        joint('shoulder', { parent: ['base'], child: ['upper'] }),
        joint('elbow', { parent: ['upper'], child: ['forearm'] }),
      ],
      parts,
    );

    expect([...rig.ownerOf]).toEqual([
      ['upper', 'shoulder'],
      ['forearm', 'elbow'],
    ]);
    expect(rig.robots[0].parts).toEqual(new Set(['base', 'upper', 'forearm', 'base-cover', 'arm-cover']));
    expect(rig.bodyParts.has('reference')).toBe(false);
    expect(rig.bodyParts.has('ungrouped')).toBe(false);
    expect(rig.bodyParts.has('unconnected')).toBe(false);
  });

  it('leaves a group spanning separate robots unassigned', () => {
    const parts = [part('cover', 'shared'), part('left', 'shared'), part('right', 'shared')];
    const rig = buildRig([joint('left-joint', { child: ['left'] }), joint('right-joint', { child: ['right'] })], parts);

    expect(rig.robots).toHaveLength(2);
    expect(rig.ownerOf.has('cover')).toBe(false);
    expect(rig.robotOf.has('cover')).toBe(false);
    expect(rig.robots.map((r) => [...r.parts])).toEqual([['left'], ['right']]);
  });

  it.each([
    { groupCount: 1, mounted: false },
    { groupCount: 200, mounted: false },
    { groupCount: 1, mounted: true },
    { groupCount: 200, mounted: true },
  ])('indexes 600 parts with $groupCount groups and mounted=$mounted in linear work', ({ groupCount, mounted }) => {
    const size = 600;
    let groupReads = 0;
    const parts = Array.from(
      { length: size },
      (_, i) =>
        new Proxy(part(`part-${i}`, `group-${i % groupCount}`), {
          get(target, key, receiver) {
            if (key === 'group') groupReads++;

            return Reflect.get(target, key, receiver);
          },
        }),
    );
    const joints = Array.from({ length: groupCount }, (_, i) =>
      joint(`joint-${i}`, mounted ? { parent: [`part-${i}`] } : { child: [`part-${i}`] }),
    );
    const rig = buildRig(joints, parts);

    expect(rig.robots).toHaveLength(groupCount);
    expect(rig.ownerOf.size).toBe(mounted ? 0 : size);

    for (let i = 0; i < size; i++) {
      expect(rig.ownerOf.get(`part-${i}`)).toBe(mounted ? undefined : `joint-${i % groupCount}`);
      expect(rig.robotOf.get(`part-${i}`)).toBe(`joint-${i % groupCount}`);
    }

    expect(groupReads).toBeLessThan(size * 20);
  });
});
