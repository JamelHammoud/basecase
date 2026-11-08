import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { runEngineering } from './engineering';
import type { EngineeringInputs } from './engineeringTypes';

export type V3 = [number, number, number];
export type Measures = Record<string, MeshMeasure>;

export const XM430 = 'dynamixel-xm430-w350';

export const part = (id: string, o: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});
export const component = (id: string, componentId: string, o: Partial<ScenePart> = {}) =>
  part(id, { kind: 'component', componentId, ...o });
export const box = (min: V3, max: V3, volumeMm3 = 100000): MeshMeasure => ({
  volumeMm3,
  areaMm2: 20000,
  min,
  max,
  centroid: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  triangles: 12,
});
export const joint = (id: string, o: Partial<RobotJoint>): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...o,
});
export const project = (o: Partial<ProjectSettings> = {}): ProjectSettings => ({
  printer: 'default',
  material: 'PETG',
  infillPct: 15,
  ...o,
});

export interface Scene {
  parts: ScenePart[];
  measures: Measures;
  joints: RobotJoint[];
}

export function biped(
  o: { lift?: number; dx?: number; prefix?: string; facing?: 'z' | 'x'; limb?: boolean } = {},
): Scene {
  const { lift = 0, dx = 0, prefix = '', facing = 'z', limb = true } = o;
  const axis: V3 = facing === 'z' ? [1, 0, 0] : [0, 0, 1];
  const place = (c: V3, s: V3): [V3, V3] => {
    const [cx, cz] = facing === 'z' ? [c[0] + dx, c[2]] : [c[2] + dx, c[0]];
    const [sx, sz] = facing === 'z' ? [s[0], s[2]] : [s[2], s[0]];

    return [
      [cx - sx / 2, c[1] + lift - s[1] / 2, cz - sz / 2],
      [cx + sx / 2, c[1] + lift + s[1] / 2, cz + sz / 2],
    ];
  };
  const scene: Scene = { parts: [], measures: {}, joints: [] };
  const add = (id: string, c: V3, s: V3, extra: Partial<ScenePart>) => {
    scene.parts.push(part(prefix + id, extra));
    scene.measures[prefix + id] = box(...place(c, s));
  };

  add('torso', [0, 500, 0], [150, 200, 100], { massG: 3000 });

  for (const [side, x] of [
    ['L', -60],
    ['R', 60],
  ] as const) {
    add(`foot${side}`, [x, 10, 0], [50, 20, 120], { massG: 100 });
    add(`shank${side}`, [x, 120, 0], [40, 200, 40], { massG: 100 });
    add(`thigh${side}`, [x, 320, 0], [40, 200, 40], { massG: 100 });

    for (const [name, y, parent, child] of [
      ['hip', 400, 'torso', `thigh${side}`],
      ['knee', 220, `thigh${side}`, `shank${side}`],
      ['ankle', 40, `shank${side}`, `foot${side}`],
    ] as const) {
      const servo = `servo-${name}${side}`;

      add(servo, [x, y, 0], [28, 46, 34], { kind: 'component', componentId: XM430, massG: 82 });

      const origin: V3 = facing === 'z' ? [x + dx, y + lift, 0] : [dx, y + lift, x];

      scene.joints.push(
        joint(prefix + name + side, {
          name: `${prefix}${name}${side}`,
          origin,
          axis,
          limb: limb ? 'leg' : undefined,
          range: [-60, 60],
          parent: [prefix + parent],
          child: [prefix + child],
          actuators: [prefix + servo],
        }),
      );
    }
  }

  return scene;
}

export const run = (s: Scene, o: Partial<ProjectSettings> = {}, extra: Partial<EngineeringInputs> = {}) =>
  runEngineering({
    parts: s.parts,
    measures: s.measures,
    project: project({ joints: s.joints, ...o }),
    servoOutputs: {},
    ...extra,
  });
export const row = (r: ReturnType<typeof runEngineering>, check: string) => r.rows.find((x) => x.check === check);
export const load = (r: ReturnType<typeof runEngineering>, id: string) => r.joints.find((l) => l.joint.id === id)!;
