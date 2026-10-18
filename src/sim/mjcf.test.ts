import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildMjcf, fromMj, quatFromMj, quatToMj, simDeltas, toMj } from './mjcf';

const part = (id: string, position: [number, number, number], size: number): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size, height: size, depth: size },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const cubeTriangles = (size: number) =>
  new Float32Array(new THREE.BoxGeometry(size, size, size).toNonIndexed().getAttribute('position').array);

const joint = (id: string, over: Partial<RobotJoint>): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...over,
});

function scene() {
  const parts = [
    part('pelvis', [0, 100, 0], 40),
    part('thigh', [0, 60, 0], 30),
    part('shin', [0, 25, 0], 24),
    part('crate', [200, 10, 0], 20),
  ];
  const joints = [
    joint('hip', { parent: ['pelvis'], child: ['thigh'], origin: [0, 80, 0], range: [-90, 45], limb: 'leg' }),
    joint('knee', { parent: ['thigh'], child: ['shin'], origin: [0, 40, 0], range: [0, 120], effortNm: 1.5 }),
  ];
  const triangles: Record<string, Float32Array> = { thigh: cubeTriangles(30) };
  const measures = Object.fromEntries(parts.map((p) => [p.id, measureTriangles(cubeTriangles(p.dimensions.width))]));

  for (const p of parts) {
    const m = measures[p.id];

    m.centroid = [p.position[0], p.position[1], p.position[2]];
  }

  return { parts, joints, triangles, measures };
}

describe('buildMjcf', () => {
  it('turns a two-joint legged robot and a loose part into MJCF', () => {
    const { parts, joints, triangles, measures } = scene();
    const model = buildMjcf({
      parts,
      rig: buildRig(joints, parts),
      project: DEFAULT_PROJECT,
      pose: { values: { hip: 20, knee: 150 }, root: { position: [5, 10, -3] } },
      measures,
      partTriangles: (id) => triangles[id] ?? null,
      posedFloor: -5,
    });

    expect(model.xml).toMatchSnapshot();
    expect({ ...model, xml: undefined }).toMatchSnapshot();
  });

  it('welds a robot without leg joints to the floor', () => {
    const { parts, joints, measures } = scene();
    const names = ['shoulder', 'elbow'];
    const arm = joints.map((j, i) => ({ ...j, id: names[i], name: names[i], limb: 'arm' as const }));
    const model = buildMjcf({
      parts,
      rig: buildRig(arm, parts),
      project: DEFAULT_PROJECT,
      measures,
      partTriangles: () => null,
      timestep: 0.005,
    });

    expect(model.robots.map((r) => r.floating)).toEqual([false]);
    expect(model.initial.roots).toEqual({});
    expect(model.xml).not.toContain('freejoint');
    expect(model.xml).toContain('timestep="0.005"');
  });
});

describe('MuJoCo frame conversions', () => {
  it('round-trips points between the Y-up scene and Z-up MuJoCo', () => {
    const p: [number, number, number] = [12, 34, -56];
    const m = toMj(p);

    expect(m).toEqual([0.012, 0.056, 0.034]);
    expect(fromMj(...m)).toEqual(p);
  });

  it('round-trips rotations', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.7, 1.1));
    const back = quatFromMj(quatToMj(q));

    expect(back.angleTo(q)).toBeLessThan(1e-9);
  });

  it('turns MuJoCo body poses back into part deltas', () => {
    const { parts, joints, measures } = scene();
    const model = buildMjcf({
      parts,
      rig: buildRig(joints, parts),
      project: DEFAULT_PROJECT,
      measures,
      partTriangles: () => null,
    });
    const poses = new Float64Array(model.bodies.flatMap((b) => [...toMj(b.origin), 1, 0, 0, 0]));
    const raised = poses.slice();

    raised[2] += 0.01;

    const deltas = simDeltas(model, poses);

    expect([...deltas.keys()]).toEqual(['pelvis', 'thigh', 'shin']);
    expect(deltas.get('thigh')!.equals(new THREE.Matrix4())).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(simDeltas(model, raised).get('pelvis')!).toArray()).toEqual([
      0, 10, 0,
    ]);
  });
});
