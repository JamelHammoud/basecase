import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
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

  it('solves mixed joints under a root transform without changing its inputs', () => {
    const parts = [part('base', [0, 0, 0]), part('upper', [50, 0, 0]), part('fore', [150, 0, 0])];
    const joints = [
      joint('shoulder', { parent: ['base'], child: ['upper'], range: [-90, 90] }),
      joint('slide', {
        type: 'prismatic',
        parent: ['upper'],
        child: ['fore'],
        origin: [100, 0, 0],
        axis: [1, 0, 0],
        range: [0, 60],
      }),
    ];
    const rig = buildRig(joints, parts);
    const root = { position: [10, 20, 30] as V3, rotation: [20, 30, 40] as V3 };
    const wanted = { shoulder: 35, slide: 25 };
    const posed = forwardKinematics(rig, { values: wanted, root });
    const targets = [
      { partId: 'upper', point: [50, 0, 0] as V3, weight: 2 },
      { partId: 'fore', point: [200, 0, 0] as V3, weight: 1 },
    ].map((t) => ({
      ...t,
      target: new THREE.Vector3(...t.point).applyMatrix4(partMotion(rig, posed, t.partId)!).toArray() as V3,
    }));
    const start = { shoulder: 5, slide: 0 };
    const before = structuredClone({ joints, root, targets, start });
    const res = solveIK(rig, start, targets, { root, preferWeight: 0, iterations: 80, tolerance: 1e-7 });

    expect(res.values.shoulder).toBeCloseTo(wanted.shoulder, 5);
    expect(res.values.slide).toBeCloseTo(wanted.slide, 5);
    expect(res.maxError).toBeLessThan(1e-5);
    expect({ joints, root, targets, start }).toEqual(before);
  });

  it('keeps excluded joints fixed while balancing weighted targets and pose preference', () => {
    const parts = [part('base', [0, 0, 0]), part('upper', [50, 0, 0]), part('fore', [150, 0, 0])];
    const joints = [
      joint('shoulder', { parent: ['base'], child: ['upper'], range: [-90, 90] }),
      joint('slide', { type: 'prismatic', parent: ['upper'], child: ['fore'], axis: [1, 0, 0], range: [0, 60] }),
    ];
    const rig = buildRig(joints, parts);
    const targets = [
      { partId: 'fore', point: [200, 0, 0] as V3, target: [220, 0, 0] as V3, weight: 3 },
      { partId: 'fore', point: [200, 0, 0] as V3, target: [240, 0, 0] as V3, weight: 1 },
    ];
    const res = solveIK(rig, { shoulder: 0, slide: 0 }, targets, {
      joints: ['slide'],
      prefer: { slide: 40 },
      preferWeight: 1,
      iterations: 80,
      tolerance: 0,
    });

    expect(res.values.shoulder).toBe(0);
    expect(res.values.slide).toBeCloseTo(28, 3);
    expect(res.errors[0]).toBeCloseTo(8, 3);
    expect(res.errors[1]).toBeCloseTo(12, 3);
  });

  it.each([8, 16])('bounds matrix copies across rejected steps with %i joints', (size) => {
    const parts = Array.from({ length: size + 1 }, (_, i) => part(`link${i}`, [i * 10, 0, 0]));
    const joints = Array.from({ length: size }, (_, i) =>
      joint(`slide${i}`, {
        type: 'prismatic',
        parent: [`link${i}`],
        child: [`link${i + 1}`],
        axis: [1, 0, 0],
        range: [0, 0],
      }),
    );
    const rig = buildRig(joints, parts);
    const arrays = vi.spyOn(Array, 'from');
    const typed = vi.spyOn(Float64Array, 'from');

    try {
      const res = solveIK(rig, {}, [{ partId: `link${size}`, point: [size * 10, 0, 0], target: [size * 20, 0, 0] }], {
        iterations: 1,
      });
      const copies = [...arrays.mock.calls, ...typed.mock.calls].filter(([source]) => source instanceof Float64Array);
      const copiedValues = copies.reduce((sum, [source]) => sum + (source as Float64Array).length, 0);

      expect(res.maxError).toBe(size * 10);
      expect(Object.values(res.values).every((value) => value === 0)).toBe(true);
      expect(copiedValues).toBeLessThanOrEqual(6 * size * size);
    } finally {
      arrays.mockRestore();
      typed.mockRestore();
    }
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
