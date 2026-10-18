import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, forwardKinematics, partMotion, solveIK, uniqueJointIds, type V3 } from './kinematics';

const part = (id: string, position: V3): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  group: { id: 'arm', name: 'Arm' },
});

const joint = (id: string, over: Partial<RobotJoint>): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 0, 1],
  ...over,
});

function arm() {
  const parts = [part('base', [0, 0, 0]), part('upper', [50, 0, 0]), part('fore', [150, 0, 0])];
  const joints = [
    joint('elbow', { parent: ['upper'], child: ['fore'], origin: [100, 0, 0], range: [-150, 150] }),
    joint('shoulder', { parent: ['base'], child: ['upper'], origin: [0, 0, 0], range: [-150, 150] }),
  ];

  return { parts, joints, rig: buildRig(joints, parts) };
}

const tip = (rig: ReturnType<typeof arm>['rig'], values: Record<string, number>) =>
  new THREE.Vector3(200, 0, 0).applyMatrix4(partMotion(rig, forwardKinematics(rig, { values }), 'fore')!);

describe('buildRig', () => {
  it('orders joints from the base out and finds one robot', () => {
    const { rig } = arm();

    expect(rig.joints.map((j) => j.id)).toEqual(['shoulder', 'elbow']);
    expect(rig.parentOf.get('elbow')).toBe('shoulder');
    expect(rig.ownerOf.get('fore')).toBe('elbow');
    expect([...rig.chain.get('elbow')!]).toEqual(['elbow', 'shoulder']);
    expect(rig.robots).toHaveLength(1);
    expect(rig.robots[0]).toMatchObject({ key: 'shoulder', name: 'Arm', joints: ['shoulder', 'elbow'] });
    expect([...rig.robots[0].parts].sort()).toEqual(['base', 'fore', 'upper']);
  });
});

describe('forwardKinematics', () => {
  it('composes rotations from the base out', () => {
    const { rig } = arm();
    const p = tip(rig, { shoulder: 90, elbow: 90 });

    expect(p.x).toBeCloseTo(-100);
    expect(p.y).toBeCloseTo(100);
    expect(p.z).toBeCloseTo(0);
  });

  it('clamps values to the joint range', () => {
    const { rig } = arm();

    expect(tip(rig, { elbow: 400 }).toArray()).toEqual(tip(rig, { elbow: 150 }).toArray());
  });
});

describe('solveIK', () => {
  it('reaches a reachable target', () => {
    const { rig } = arm();
    const target: V3 = [120, 90, 0];
    const res = solveIK(rig, { elbow: 20 }, [{ partId: 'fore', point: [200, 0, 0], target }], { iterations: 80 });
    const reached = tip(rig, res.values);

    expect(res.maxError).toBeLessThan(0.5);
    expect(reached.distanceTo(new THREE.Vector3(...target))).toBeLessThan(0.5);
  });

  it('reports the miss for a target out of reach', () => {
    const { rig } = arm();
    const res = solveIK(rig, {}, [{ partId: 'fore', point: [200, 0, 0], target: [500, 0, 0] }]);

    expect(res.maxError).toBeCloseTo(300, 0);
  });
});

describe('uniqueJointIds', () => {
  it('renames a repeated robot with a shared suffix', () => {
    const { joints } = arm();
    const out = uniqueJointIds([...joints, ...joints.map((j) => ({ ...j, parentJoint: 'shoulder' }))]);

    expect(out.map((j) => j.id)).toEqual(['elbow', 'shoulder', 'elbow_2', 'shoulder_2']);
    expect(out[2].parentJoint).toBe('shoulder_2');
  });
});
