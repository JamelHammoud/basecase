import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../../three/meshMeasure';
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
}

export const joint = (s: JointSpec): RobotJoint => ({
  id: s.id,
  name: s.id,
  type: 'revolute',
  parent: [s.link[0]],
  child: [s.link[1]],
  origin: s.origin,
  axis: s.axis,
  effortNm: s.effortNm,
  ...(s.range === null ? {} : { range: s.range ?? [-90, 90] }),
  ...(s.parentJoint ? { parentJoint: s.parentJoint } : {}),
  ...(s.limb ? { limb: s.limb } : {}),
});

const boxTriangles = (p: ScenePart) => {
  const d = p.dimensions;

  return new Float32Array(
    new THREE.BoxGeometry(d.width, d.height, d.depth).toNonIndexed().getAttribute('position').array,
  );
};

export function fixtureMeasures(parts: ScenePart[]): Record<string, MeshMeasure> {
  return Object.fromEntries(
    parts.map((p) => {
      const m = measureTriangles(boxTriangles(p));

      m.centroid = [p.position[0], p.position[1], p.position[2]];

      return [p.id, m];
    }),
  );
}

export function fixtureTriangles(parts: ScenePart[]): (id: string) => Float32Array | null {
  const byId = new Map(parts.map((p) => [p.id, p]));

  return (id) => {
    const p = byId.get(id);

    return p ? boxTriangles(p) : null;
  };
}
