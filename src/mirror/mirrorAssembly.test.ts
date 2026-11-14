import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { V3 } from '../agent/agentFrame';
import { box } from '../sim/fixtures/parts';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { mirrorAssembly } from './mirrorAssembly';
import { reflectPoint, type MirrorPlane } from './plane';
import { planeFor } from './planeFor';

const ids = () => {
  let n = 0;

  return (prefix = 'part') => `${prefix}-${++n}`;
};

const torso: ScenePart = {
  ...box('torso', [0, 100, 0], [80, 60, 40], 400),
  name: 'Torso',
  kind: 'cad_part',
  cad: {
    language: 'openscad',
    code: 'cube([80, 40, 60], center = true);',
    positions: [],
    indices: [],
    originOffset: [0, 0, 0],
    baseSize: [80, 60, 40],
    ports: [
      { name: 'left_mount', kind: 'face', position: [30, 0, -30], axis: [0, 0, -1] },
      { name: 'right_mount', kind: 'face', position: [-30, 0, -30], axis: [0, 0, -1] },
    ],
  },
};

const thigh: ScenePart = {
  ...box('thigh', [30, 60, 0], [20, 40, 20], 60),
  name: 'Left hip bracket',
  group: { id: 'g-left-leg', name: 'Left Leg' },
  mates: [{ port: 'top', target: 'torso', targetPort: 'left_mount', type: 'face' }],
  kind: 'cad_part',
  cad: {
    language: 'openscad',
    code: 'cube([20, 20, 40], center = true);',
    positions: [],
    indices: [],
    originOffset: [0, 0, 0],
    baseSize: [20, 40, 20],
    ports: [{ name: 'top', kind: 'face', position: [0, 0, 10], axis: [0, 0, 1] }],
  },
};

const shin: ScenePart = { ...box('shin', [30, 20, 0], [20, 40, 20], 40), name: 'Left shin', group: thigh.group };

const joints: RobotJoint[] = [
  {
    id: 'left_hip',
    name: 'Left hip',
    type: 'revolute',
    parent: ['torso'],
    child: ['thigh'],
    origin: [30, 80, 0],
    axis: [1, 0, 0],
    range: [-30, 90],
  },
  {
    id: 'left_knee',
    name: 'Left knee',
    type: 'revolute',
    parent: ['thigh'],
    child: ['shin'],
    parentJoint: 'left_hip',
    origin: [30, 40, 0],
    axis: [0.6, 0, 0.8],
    range: [0, 120],
  },
];

const scene = { parts: [torso, thigh, shin], joints };

function turned(point: V3, joint: RobotJoint, deg: number): V3 {
  const o = new THREE.Vector3(...joint.origin);
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...joint.axis).normalize(),
    (deg * Math.PI) / 180,
  );

  return new THREE.Vector3(...point).sub(o).applyQuaternion(q).add(o).toArray() as V3;
}

const close = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('mirrorAssembly', () => {
  it("picks the robot's own plane for a leg that hangs off its body", () => {
    expect(planeFor('right', [thigh, shin], scene)).toEqual({ axis: 0, offset: 0 });
    expect(planeFor('right', [thigh], { parts: [thigh, shin] })).toEqual({ axis: 0, offset: 30 });
    expect(planeFor('top', [thigh, shin], scene)).toEqual({ axis: 1, offset: 40 });
  });

  it('twins both leg joints with mirrored axes and the same ranges', () => {
    const plane = planeFor('right', [thigh, shin], scene);
    const { copies, joints: twins } = mirrorAssembly(scene, { ids: ['thigh', 'shin'], plane, newId: ids() });
    const [thighCopy, shinCopy] = copies;
    const [hip, knee] = twins;

    expect(copies.map((c) => c.position)).toEqual([
      [-30, 60, 0],
      [-30, 20, 0],
    ]);
    expect(hip).toMatchObject({ id: 'right_hip', name: 'Right hip', parent: ['torso'], child: [thighCopy.id] });
    expect(knee).toMatchObject({ id: 'right_knee', parent: [thighCopy.id], child: [shinCopy.id] });
    expect(knee.parentJoint).toBe('right_hip');
    expect(twins.map((j) => j.range)).toEqual([
      [-30, 90],
      [0, 120],
    ]);
    expect(hip.origin).toEqual([-30, 80, 0]);
    expect(hip.frame?.part).toBe('torso');

    for (const [source, twin] of [
      [joints[0], hip],
      [joints[1], knee],
    ])
      for (const deg of [-30, 45, 90]) {
        const p: V3 = [36, 12, 7];
        const want = reflectPoint(turned(p, source, deg), plane);

        expect(close(turned(reflectPoint(p, plane), twin, deg), want)).toBeLessThan(1e-9);
      }
  });

  it('names copies after their source with the sides swapped, in a new group', () => {
    const plane: MirrorPlane = { axis: 0, offset: 0 };
    const { copies } = mirrorAssembly(scene, { ids: ['thigh', 'shin'], plane, newId: ids() });

    expect(copies.map((c) => c.name)).toEqual(['Right hip bracket', 'Right shin']);
    expect(copies[0].group).toEqual({ id: 'group-3', name: 'Right Leg' });
    expect(copies[1].group).toBe(copies[0].group);
    expect(copies[0].mirrorOf).toEqual({ id: 'thigh', axis: 'x' });
  });

  it('mates a copy to the matching port on the body', () => {
    const plane: MirrorPlane = { axis: 0, offset: 0 };
    const { copies } = mirrorAssembly(scene, { ids: ['thigh'], plane, newId: ids() });

    expect(copies[0].mates).toEqual([{ port: 'top', target: 'torso', targetPort: 'right_mount', type: 'face' }]);
  });

  it('adds no joint when the child stays put', () => {
    const plane: MirrorPlane = { axis: 0, offset: 0 };

    expect(mirrorAssembly(scene, { ids: ['torso'], plane, newId: ids() }).joints).toEqual([]);
  });
});
