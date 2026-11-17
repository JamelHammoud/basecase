import { Matrix4 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RobotJoint, RobotPoseState, ScenePart } from '../types/robotics';
import { buildRig, forwardKinematics, partMotion, poseDeltas, type Rig } from './kinematics';

const part = (id: string): ScenePart => ({
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
});

function fixture(count: number) {
  const children = Array.from({ length: count }, (_, i) => `arm-${i}`);
  const bases = Array.from({ length: count }, (_, i) => `base-${i}`);
  const joint: RobotJoint = {
    id: 'hinge',
    name: 'Hinge',
    type: 'revolute',
    parent: bases,
    child: children,
    origin: [17, -23, 41],
    axis: [2, -3, 4],
  };
  const second: RobotJoint = { ...joint, id: 'second', parent: ['other-base'], child: ['other-arm'] };
  const ids = [...bases, ...children, 'other-base', 'other-arm', 'unowned'];
  const rig = buildRig([joint, second], ids.map(part));

  return { rig, ids, children, bases };
}

function previousDeltas(rig: Rig, pose: RobotPoseState | null, ids: string[]) {
  const out = new Map<string, Matrix4>();

  if (!pose) return out;

  const posed = forwardKinematics(rig, pose);
  const identity = new Matrix4().elements;

  for (const id of ids) {
    const matrix = partMotion(rig, posed, id);

    if (matrix && !matrix.elements.every((value, i) => Math.abs(value - identity[i]) < 1e-9)) out.set(id, matrix);
  }

  return out;
}

describe('pose delta transform classification', () => {
  it('preserves ordered transforms across robots, missing parts, duplicate requests and later pose edits', () => {
    const { rig, ids, children } = fixture(12);
    const requested = [...ids.toReversed(), 'missing', children[0], children[1]];
    const poses: (RobotPoseState | null)[] = [
      null,
      { values: {} },
      { values: { hinge: 37, second: -23 } },
      { values: { hinge: 0, second: 360 }, roots: { hinge: { position: [7, -11, 13] } } },
      { values: { hinge: -43 }, roots: { second: { rotation: [13, 27, -31] } } },
      { values: { hinge: Infinity }, roots: { second: { position: [Infinity, 0, 0] } } },
      { values: {} },
    ];

    for (const pose of poses) {
      const saved = structuredClone(pose);
      const actual = poseDeltas(rig, pose, requested);

      expect(actual).toEqual(previousDeltas(rig, pose, requested));
      expect(pose).toEqual(saved);

      if (actual.has(children[0])) expect(actual.get(children[0])).toBe(actual.get(children[1]));
    }
  });

  it('keeps the strict identity threshold across shared roots and independent calls', () => {
    const { rig, ids, bases } = fixture(4);
    const retained = poseDeltas(rig, { values: { hinge: 47 } }, ids);
    const snapshot = [...retained].map(([id, matrix]) => [id, matrix.toArray()]);

    for (const offset of [0, -0, 0.5e-9, -0.5e-9, 1e-9, -1e-9, 2e-9]) {
      const pose = { values: {}, roots: { hinge: { position: [offset, 0, 0] as [number, number, number] } } };
      const actual = poseDeltas(rig, pose, ids);

      expect(actual).toEqual(previousDeltas(rig, pose, ids));
      expect(actual.has(bases[0])).toBe(Math.abs(offset) >= 1e-9);
    }

    expect([...retained].map(([id, matrix]) => [id, matrix.toArray()])).toEqual(snapshot);
  });

  it.each([300, 600])('classifies shared moving and stationary matrices once for %i attached parts', (count) => {
    const { rig, ids, children, bases } = fixture(count);
    const pose = { values: { hinge: 37 } };
    const absolute = vi.spyOn(Math, 'abs');

    try {
      poseDeltas(rig, pose, [bases[0], children[0], 'other-base', 'other-arm']);

      const once = absolute.mock.calls.length;

      absolute.mockClear();

      const actual = poseDeltas(rig, pose, ids);

      expect(absolute.mock.calls).toHaveLength(once);
      expect([...actual.keys()]).toEqual(children);
    } finally {
      absolute.mockRestore();
    }
  });
});
