import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint, resolveJoints } from './kinematics';

const joint = (id: string, frame?: RobotJoint['frame']): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [7, 8, 9],
  axis: [1, 0, 0],
  frame,
});

const mount = (id: string): ScenePart => ({
  ...box(id, [10, 20, 30], [20, 20, 20], 100),
  rotation: [0, 0, 90],
});

function closeVector(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);

  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5));
}

describe('joint mount frames', () => {
  it('resolves distinct pivots and axes on a shared rotated mount without editing their local frames', () => {
    const joints = [
      joint('hinge', { part: 'base', origin: [2, 3, 4], axis: [1, 0, 0] }),
      { ...joint('slider', { part: 'base', origin: [-5, 6, 7], axis: [0, 2, 0] }), type: 'prismatic' as const },
    ];
    const before = structuredClone(joints);
    const resolved = resolveJoints(joints, [mount('base')]);

    closeVector(resolved[0].origin, [7, 22, 34]);
    closeVector(resolved[0].axis, [0, 1, 0]);
    closeVector(resolved[1].origin, [4, 15, 37]);
    closeVector(resolved[1].axis, [-1, 0, 0]);
    expect(resolved[1].type).toBe('prismatic');
    expect(joints).toEqual(before);
    expect(resolved[0].frame).toBe(joints[0].frame);
    expect(resolved[1].frame).toBe(joints[1].frame);
  });

  it('reads each used mount once across 600 interleaved joint frames', () => {
    const reads = new Map<string, number>();
    const parts = Array.from({ length: 4 }, (_, i) => {
      const part: ScenePart = { ...mount(`mount-${i}`), position: [10 + i, 20, 30] };

      return new Proxy(part, {
        get(target, key, receiver) {
          if (key === 'rotation') reads.set(target.id, (reads.get(target.id) ?? 0) + 1);

          return Reflect.get(target, key, receiver);
        },
      });
    });
    const joints = Array.from({ length: 600 }, (_, i) =>
      joint(`joint-${i}`, { part: `mount-${i % 3}`, origin: [i, 0, 0], axis: [1, 0, 0] }),
    );
    const resolved = resolveJoints(joints, parts);

    resolved.forEach((j, i) => {
      expect(j.id).toBe(`joint-${i}`);
      closeVector(j.origin, [10 + (i % 3), 20 + i, 30]);
      closeVector(j.axis, [0, 1, 0]);
    });
    expect([...reads]).toEqual([
      ['mount-0', 1],
      ['mount-1', 1],
      ['mount-2', 1],
    ]);
  });

  it('follows a replaced mount and undo on the next call', () => {
    const original = mount('base');
    const moved: ScenePart = { ...original, position: [-10, 40, 50], rotation: [90, 0, 0] };
    const anchored = anchorJoint({ ...joint('hinge'), parent: ['base'] }, [original]);
    const parts = [original];
    const joints = [anchored];
    const before = resolveJoints(joints, parts)[0];

    parts[0] = moved;

    const after = resolveJoints(joints, parts)[0];

    closeVector(before.origin, [7, 8, 9]);
    closeVector(before.axis, [1, 0, 0]);
    closeVector(after.origin, [-22, 61, 53]);
    closeVector(after.axis, [0, 0, -1]);
    expect(resolveJoints(joints, [original])).toEqual([before]);
  });

  it('keeps unresolved joints and unframed lists unchanged', () => {
    const missing = joint('missing', { part: 'gone', origin: [0, 0, 0], axis: [0, 0, 1] });
    const plain = joint('plain');
    const framed = joint('framed', { part: 'base', origin: [0, 0, 0], axis: [0, 1, 0] });
    const resolved = resolveJoints([missing, plain, framed], [mount('base')]);
    const unframed = [plain];
    const empty: RobotJoint[] = [];

    expect(resolved[0]).toBe(missing);
    expect(resolved[1]).toBe(plain);
    closeVector(resolved[2].origin, [10, 20, 30]);
    expect(resolveJoints(unframed, [mount('base')])).toBe(unframed);
    expect(resolveJoints(empty, [])).toBe(empty);
    expect(resolveJoints([missing], [])[0]).toBe(missing);
  });
});
