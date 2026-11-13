import * as THREE from 'three';
import { hardwareDimensions, type HardwareSpec } from '../../data/hardware';
import { fastenerSpec, type ScrewSpec } from '../../assembly/fastenerSpec';
import type { ScenePart } from '../../types/robotics';

export type V3 = [number, number, number];

export interface Hole {
  u: number;
  v: number;
  r: number;
}

export interface PlateSpec {
  origin: V3;
  u: V3;
  v: V3;
  size: [number, number, number];
  holes?: Hole[];
}

export function plateTriangles({ origin, u, v, size: [su, sv, t], holes = [] }: PlateSpec): number[] {
  const shape = new THREE.Shape().moveTo(0, 0).lineTo(su, 0).lineTo(su, sv).lineTo(0, sv).closePath();

  for (const h of holes) shape.holes.push(new THREE.Path().absarc(h.u, h.v, h.r, 0, Math.PI * 2, true));

  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 20 }).toNonIndexed();
  const p = g.attributes.position.array;
  const w = new THREE.Vector3(...u).cross(new THREE.Vector3(...v));
  const out: number[] = [];

  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) out.push(origin[k] + p[i] * u[k] + p[i + 1] * v[k] + p[i + 2] * w.getComponent(k));

  return out;
}

const base = (id: string, o: Partial<ScenePart>): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#d9d9d9',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const SHANKS = {
  '-y': { rotation: [0, 0, 0], dir: [0, -1, 0] },
  '+z': { rotation: [-90, 0, 0], dir: [0, 0, 1] },
  '-z': { rotation: [90, 0, 0], dir: [0, 0, -1] },
  '+x': { rotation: [0, 0, 90], dir: [1, 0, 0] },
} satisfies Record<string, { rotation: V3; dir: V3 }>;

export type Shank = keyof typeof SHANKS;

export function sceneBuilder(turn: THREE.Quaternion = new THREE.Quaternion()) {
  const turned = (p: number[]) => {
    const out: number[] = [];
    const v = new THREE.Vector3();

    for (let i = 0; i < p.length; i += 3)
      out.push(
        ...v
          .set(p[i], p[i + 1], p[i + 2])
          .applyQuaternion(turn)
          .toArray(),
      );

    return out;
  };

  const placed = (at: V3, rotation: V3): { position: V3; rotation: V3 } => {
    const local = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(rotation.map((d) => THREE.MathUtils.degToRad(d)) as V3), 'XYZ'),
    );
    const e = new THREE.Euler().setFromQuaternion(turn.clone().multiply(local), 'XYZ');

    return {
      position: new THREE.Vector3(...at).applyQuaternion(turn).toArray() as V3,
      rotation: [e.x, e.y, e.z].map((r) => Math.round(THREE.MathUtils.radToDeg(r) * 1e6) / 1e6) as V3,
    };
  };

  return {
    point: (at: V3) => new THREE.Vector3(...at).applyQuaternion(turn).toArray() as V3,
    printed: (id: string, name: string, plates: PlateSpec[], o: Partial<ScenePart> = {}): ScenePart => {
      const positions = turned(plates.flatMap(plateTriangles));
      const size = new THREE.Box3().setFromArray(positions).getSize(new THREE.Vector3());

      return base(id, {
        name,
        dimensions: { width: size.x, height: size.y, depth: size.z },
        cad: {
          language: 'openscad',
          code: '',
          positions,
          indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
          originOffset: [0, 0, 0],
          baseSize: [size.x, size.y, size.z],
        },
        ...o,
      });
    },
    servo: (id: string, name: string, at: V3, rotation: V3 = [0, 0, 0]): ScenePart =>
      base(id, {
        name,
        kind: 'component',
        category: 'actuators',
        componentId: 'feetech-sts3215',
        componentVariant: 'c001',
        dimensions: { width: 45.2, height: 35, depth: 24.7 },
        ...placed(at, rotation),
      }),
    screw: (id: string, spec: HardwareSpec, seat: { at: V3; shank: Shank }): ScenePart => {
      const dims = hardwareDimensions(spec);
      const under = (fastenerSpec(base(id, { kind: 'hardware', hardware: spec })) as ScrewSpec).underY;
      const { rotation, dir } = SHANKS[seat.shank];

      return base(id, {
        name: `${spec.size} Screw`,
        kind: 'hardware',
        category: 'hardware',
        hardware: spec,
        dimensions: { width: dims.width, height: dims.height, depth: dims.depth },
        ...placed(seat.at.map((v, k) => v + dir[k] * under) as V3, rotation as V3),
      });
    },
  };
}
