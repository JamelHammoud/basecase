import { describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig } from './kinematicsRig';

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

const part = (id: string, group?: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  group: group === undefined ? undefined : { id: group, name: group },
});

describe('ordered robot groups', () => {
  it('keeps depth order, base pivots, keys and duplicate names across interleaved robots', () => {
    const joints = [
      joint('z-tip', { parentJoint: 'z-base', child: ['z-tool'], origin: [100, 0, 0] }),
      joint('a-base', { child: ['a-tool'], origin: [1, 2, 3] }),
      joint('z-base', { child: ['z-body'], origin: [10, 20, 30] }),
      joint('a-tip', { parentJoint: 'a-base', origin: [50, 0, 0] }),
    ];
    const parts = [part('z-tool', 'Arm'), part('a-tool', 'Arm'), part('z-body', 'Arm'), part('loose')];
    const before = structuredClone({ joints, parts });
    const rig = buildRig(joints, parts);

    expect(rig.robots).toEqual([
      { key: 'a-base', name: 'Arm', joints: ['a-base', 'a-tip'], parts: new Set(['a-tool']), pivot: [1, 2, 3] },
      {
        key: 'z-base',
        name: 'Arm 2',
        joints: ['z-base', 'z-tip'],
        parts: new Set(['z-tool', 'z-body']),
        pivot: [10, 20, 30],
      },
    ]);
    expect(rig.rootPivot).toEqual([1, 2, 3]);
    expect([...rig.robotOf]).toEqual([
      ['z-base', 'z-base'],
      ['z-tip', 'z-base'],
      ['z-tool', 'z-base'],
      ['z-body', 'z-base'],
      ['a-base', 'a-base'],
      ['a-tip', 'a-base'],
      ['a-tool', 'a-base'],
    ]);
    expect(rig.bodyParts).toEqual(new Set(['a-tool', 'z-tool', 'z-body']));
    expect({ joints, parts }).toEqual(before);
  });

  it('averages all base pivots when shared parts connect multiple roots', () => {
    const joints = [
      joint('z-root', { parent: ['base'], origin: [10, 20, 30] }),
      joint('tip', { parentJoint: 'z-root' }),
      joint('a-root', { parent: ['base'], origin: [30, 40, 50] }),
      joint('empty'),
    ];
    const rig = buildRig(joints, [part('base')]);

    expect(rig.robots).toEqual([
      {
        key: 'a-root',
        name: 'Robot',
        joints: ['z-root', 'a-root', 'tip'],
        parts: new Set(['base']),
        pivot: [20, 30, 40],
      },
      { key: 'empty', name: 'Robot 2', joints: ['empty'], parts: new Set(), pivot: [0, 0, 0] },
    ]);
    expect(buildRig([], [part('loose')]).robots).toEqual([]);
  });

  it('rebuilds membership and pivots after edits and undo without retaining prior groups', () => {
    const joints = [joint('left', { origin: [1, 0, 0] }), joint('right', { origin: [3, 0, 0] })];
    const first = buildRig(joints, []);
    const edited = buildRig([joints[0], { ...joints[1], parentJoint: 'left', origin: [9, 0, 0] }], []);

    expect(edited.robots).toEqual([
      { key: 'left', name: 'Robot', joints: ['left', 'right'], parts: new Set(), pivot: [1, 0, 0] },
    ]);
    expect(first.robots).toHaveLength(2);
    expect(buildRig(joints, [])).toEqual(first);
  });

  it.each([300, 600])('bounds joint lookups across %i independent robots', (size) => {
    let reads = 0;
    const joints = Array.from(
      { length: size },
      (_, i) =>
        new Proxy(joint(`joint-${i}`, { origin: [i, 0, 0] }), {
          get(target, key, receiver) {
            if (key === 'id') reads++;

            return Reflect.get(target, key, receiver);
          },
        }),
    );
    const rig = buildRig(joints, []);
    const buildReads = reads;
    const robots = new Map(rig.robots.map((robot) => [robot.key, robot]));

    expect(rig.robots).toHaveLength(size);
    expect(rig.joints).toEqual(joints);

    for (let i = 0; i < size; i++) {
      const id = `joint-${i}`;
      const robot = robots.get(id)!;

      expect(robot.joints).toEqual([id]);
      expect(robot.pivot).toEqual([i, 0, 0]);
      expect(rig.robotOf.get(id)).toBe(id);
    }

    expect(buildReads).toBeLessThan(size * 20);
  });
});
