import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../../three/meshMeasure';
import { COMPONENT_BY_ID, componentSize } from '../../data/components';
import { LIDAR_SCAN } from '../../data/lidarScan';
import type { RobotJoint, ScenePart } from '../../types/robotics';

export type P3 = [number, number, number];

export interface FixtureRobot {
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  expect: { morphology: string; stand: 'pass' | 'fail' | 'n/a'; walk: 'pass' | 'fail' | 'uncertain' | 'n/a' };
}

export const box = (id: string, position: P3, size: P3, massG: number): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  massG,
});

export interface JointSpec {
  id: string;
  link: [string, string];
  origin: P3;
  axis: P3;
  effortNm: number;
  range?: [number, number] | null;
  parentJoint?: string;
  limb?: RobotJoint['limb'];
  type?: 'revolute' | 'prismatic';
}

export const joint = (s: JointSpec): RobotJoint => ({
  id: s.id,
  name: s.id,
  type: s.type ?? 'revolute',
  parent: [s.link[0]],
  child: [s.link[1]],
  origin: s.origin,
  axis: s.axis,
  effortNm: s.effortNm,
  ...(s.range === null ? {} : { range: s.range ?? [-90, 90] }),
  ...(s.parentJoint ? { parentJoint: s.parentJoint } : {}),
  ...(s.limb ? { limb: s.limb } : {}),
});

const CYLINDER_SEGMENTS = 32;

export const cylinder = (id: string, position: P3, size: P3, massG: number): ScenePart => ({
  ...box(id, position, size, massG),
  kind: 'cylinder',
});

const partGeometry = (p: ScenePart): THREE.BufferGeometry => {
  const d = p.dimensions;

  if (p.kind !== 'cylinder') return new THREE.BoxGeometry(d.width, d.height, d.depth);

  return new THREE.CylinderGeometry(d.width / 2, d.width / 2, d.height, CYLINDER_SEGMENTS).scale(
    1,
    1,
    d.depth / Math.max(d.width, 0.001),
  );
};

const partTriangles = (p: ScenePart) => new Float32Array(partGeometry(p).toNonIndexed().getAttribute('position').array);

export function fixtureMeasures(parts: ScenePart[]): Record<string, MeshMeasure> {
  return Object.fromEntries(
    parts.map((p) => {
      const m = measureTriangles(partTriangles(p));

      m.centroid = [p.position[0], p.position[1], p.position[2]];

      return [p.id, m];
    }),
  );
}

export function placedMeasures(parts: ScenePart[]): Record<string, MeshMeasure> {
  const turn = new THREE.Quaternion();

  return Object.fromEntries(
    parts.map((p) => {
      const [x, y, z] = p.rotation.map((v) => THREE.MathUtils.degToRad(v));
      const place = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        turn.setFromEuler(new THREE.Euler(x, y, z)),
        new THREE.Vector3(1, 1, 1),
      );
      const triangles = partTriangles(p);

      new THREE.BufferAttribute(triangles, 3).applyMatrix4(place);

      return [p.id, measureTriangles(triangles)];
    }),
  );
}

export function fixtureTriangles(parts: ScenePart[]): (id: string) => Float32Array | null {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return (id) => {
    const p = byId.get(id);

    return p ? partTriangles(p) : null;
  };
}

export function withLidar(robot: FixtureRobot, componentId = 'slamtec-rplidar-c1', on = 'chassis'): FixtureRobot {
  const base = robot.parts.find((p) => p.id === on)!;
  const size = componentSize(componentId);
  const head = LIDAR_SCAN[componentId]?.origin ?? [0, 0, 0];
  const group = { id: `${robot.id}-body`, name: robot.id };
  const top = base.position[1] + base.dimensions.height / 2;
  const lidar: ScenePart = {
    ...box(
      'lidar',
      [base.position[0] - head[0], top + size.height / 2 - 3, base.position[2] - head[2]],
      [0, 0, 0],
      110,
    ),
    name: COMPONENT_BY_ID[componentId].name,
    kind: 'component',
    category: 'perception',
    componentId,
    dimensions: size,
    group,
  };

  return {
    ...robot,
    id: `${robot.id}-lidar`,
    parts: [...robot.parts.map((p) => (p.id === on ? { ...p, group } : p)), lidar],
  };
}
