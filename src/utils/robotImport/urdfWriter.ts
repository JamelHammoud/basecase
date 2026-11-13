import * as THREE from 'three';
import { toMj } from '../../sim/mjcfFrames';
import { esc, f, safeId, vec } from '../../sim/mjcfText';
import type { SimBody, SimJoint, SimModel } from '../../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import type { PartMass } from '../engineeringTypes';
import type { V3 } from '../kinematics';
import { linkInertial, placedParts, type LinkInertial, type PlacedPart } from './urdfLinks';

export interface UrdfInput {
  name: string;
  model: Pick<SimModel, 'bodies' | 'joints' | 'robots'>;
  joints: RobotJoint[];
  parts: ScenePart[];
  masses: PartMass[];
  triangles: (id: string) => Float32Array | null;
  meshUri?: (path: string) => string;
  tail?: string[];
}

export interface UrdfFiles {
  urdf: string;
  meshes: Record<string, Float32Array>;
  root: string;
}

interface WriteState {
  input: UrdfInput;
  byId: Map<string, ScenePart>;
  masses: Map<string, PartMass>;
  meshes: Record<string, Float32Array>;
  colors: Map<string, string>;
  links: string[];
  joints: string[];
}

export const WORLD_LINK = 'world';

const BASE_LINK = 'base_link';

const origin = (xyz: V3) => `<origin xyz="${vec(xyz)}" rpy="0 0 0"/>`;

function colorName(st: WriteState, hex: string): string {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1).toLowerCase() : '888888';
  const name = `c_${clean}`;

  if (!st.colors.has(name)) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);

    st.colors.set(name, `  <material name="${name}"><color rgba="${vec([r, g, b, 1])}"/></material>`);
  }

  return name;
}

function meshPath(st: WriteState, p: PlacedPart): string {
  const base = safeId(p.part.id) || 'part';
  const fileOf = (n: number) => `meshes/${n > 1 ? `${base}_${n}` : base}.stl`;
  let n = 1;

  while (st.meshes[fileOf(n)]) n++;

  const path = fileOf(n);

  st.meshes[path] = p.triangles;

  return path;
}

function inertialXml({ kg, com, inertia: I }: LinkInertial): string[] {
  return [
    '    <inertial>',
    `      ${origin(com)}`,
    `      <mass value="${f(kg)}"/>`,
    `      <inertia ixx="${f(I.ixx)}" ixy="${f(I.ixy)}" ixz="${f(I.ixz)}" iyy="${f(I.iyy)}" iyz="${f(I.iyz)}" izz="${f(I.izz)}"/>`,
    '    </inertial>',
  ];
}

function geometryXml(st: WriteState, p: PlacedPart): string[] {
  const path = meshPath(st, p);
  const mesh = `<geometry><mesh filename="${esc(st.input.meshUri?.(path) ?? path)}"/></geometry>`;

  return [
    `    <visual>`,
    `      ${mesh}`,
    `      <material name="${colorName(st, p.part.color)}"/>`,
    '    </visual>',
    `    <collision>`,
    `      ${mesh}`,
    '    </collision>',
  ];
}

function linkXml(st: WriteState, body: SimBody) {
  const placed = placedParts({ body, byId: st.byId, masses: st.masses, triangles: st.input.triangles });

  st.links.push(
    `  <link name="${esc(body.name)}">`,
    ...inertialXml(linkInertial(placed)),
    ...placed.flatMap((p) => geometryXml(st, p)),
    '  </link>',
  );
}

const toUnit = (j: SimJoint, v: number) => (j.type === 'revolute' ? THREE.MathUtils.degToRad(v) : v / 1000);

function limitXml(j: SimJoint, scene: RobotJoint | undefined): string {
  const velocity = scene?.velocity ? toUnit(j, scene.velocity) : 0;
  const motion = `effort="${f(j.effort)}" velocity="${f(velocity)}"`;

  if (!j.range) return `<limit ${motion}/>`;

  const [lo, hi] = [Math.min(...j.range), Math.max(...j.range)].map((v) => toUnit(j, v));

  return `<limit lower="${f(lo)}" upper="${f(hi)}" ${motion}/>`;
}

function jointType(j: SimJoint | undefined): string {
  if (!j) return 'fixed';

  if (j.type === 'prismatic') return 'prismatic';

  return j.range ? 'revolute' : 'continuous';
}

interface JointLink {
  name: string;
  parent: string;
  child: string;
  at: V3;
}

function jointXml(st: WriteState, link: JointLink, body?: SimBody) {
  const sim = body?.joint ? st.input.model.joints.find((j) => j.id === body.joint) : undefined;
  const scene = body?.joint ? st.input.joints.find((j) => j.id === body.joint) : undefined;
  const lines = [
    `  <joint name="${esc(link.name)}" type="${jointType(sim)}">`,
    `    <parent link="${esc(link.parent)}"/>`,
    `    <child link="${esc(link.child)}"/>`,
    `    ${origin(link.at)}`,
  ];

  if (sim && scene) {
    const axis = new THREE.Vector3(...toMj(scene.axis)).normalize();

    lines.push(`    <axis xyz="${vec([axis.x, axis.y, axis.z])}"/>`, `    ${limitXml(sim, scene)}`);
  }

  st.joints.push(...lines, '  </joint>');
}

const offset = (a: V3, b: V3) => toMj([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);

function writeRobot(st: WriteState, key: string, root: string) {
  const bodies = st.input.model.bodies.filter((b) => b.robot === key);
  const byName = new Map(bodies.map((b) => [b.name, b]));

  for (const body of bodies) {
    linkXml(st, body);

    const parent = body.parent ? byName.get(body.parent) : undefined;

    if (parent) {
      const link = { name: body.name.replace(/^b_/, ''), parent: parent.name, child: body.name };

      jointXml(st, { ...link, at: offset(body.origin, parent.origin) }, body);
    } else {
      jointXml(st, { name: `${root}_${body.name}`, parent: root, child: body.name, at: toMj(body.origin) });
    }
  }
}

export function writeUrdf(input: UrdfInput): UrdfFiles {
  const st: WriteState = {
    input,
    byId: new Map(input.parts.map((p) => [p.id, p])),
    masses: new Map(input.masses.map((m) => [m.id, m])),
    meshes: {},
    colors: new Map(),
    links: [],
    joints: [],
  };
  const root = input.model.robots.length > 1 ? WORLD_LINK : BASE_LINK;

  st.links.push(`  <link name="${root}"/>`);

  for (const robot of input.model.robots) writeRobot(st, robot.key, root);

  const urdf = [
    '<?xml version="1.0"?>',
    `<robot name="${esc(input.name)}">`,
    ...st.colors.values(),
    ...st.links,
    ...st.joints,
    ...(input.tail ?? []),
    '</robot>',
    '',
  ].join('\n');

  return { urdf, meshes: st.meshes, root };
}
