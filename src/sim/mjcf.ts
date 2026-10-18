import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { actuatorOf } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, RobotPoseState, ScenePart } from '../types/robotics';
import { partMasses } from '../utils/engineering';
import { clampJoint, isMovable, partMatrix, robotPose, type Rig, type V3 } from '../utils/kinematics';

export const toMj = (v: V3 | THREE.Vector3): V3 => {
  const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];

  return [x / 1000, -z / 1000, y / 1000];
};
export const fromMj = (x: number, y: number, z: number): V3 => [x * 1000, z * 1000, -y * 1000];
export function quatFromMj(wxyz: ArrayLike<number>, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.set(wxyz[1], wxyz[3], -wxyz[2], wxyz[0]);
}
export const quatToMj = (q: THREE.Quaternion): [number, number, number, number] => [q.w, q.x, -q.z, q.y];

export function simDeltas(model: SimModel, poses: Float64Array): Map<string, THREE.Matrix4> {
  const out = new Map<string, THREE.Matrix4>();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  model.bodies.forEach((b, i) => {
    if (!b.parts.length) return;

    const o = i * 7;
    const p = fromMj(poses[o], poses[o + 1], poses[o + 2]);

    quatFromMj(poses.subarray(o + 3, o + 7), q);
    m.makeRotationFromQuaternion(q);

    const r = new THREE.Vector3(...b.origin).applyQuaternion(q);

    m.setPosition(p[0] - r.x, p[1] - r.y, p[2] - r.z);

    for (const id of b.parts) out.set(id, m.clone());
  });

  return out;
}

export interface SimBody {
  name: string;
  parts: string[];
  origin: V3;
}

export interface SimJoint {
  id: string;
  name: string;
  type: 'revolute' | 'prismatic';
  range?: [number, number];
  effort: number;
  effortSource: 'servo' | 'published' | 'estimate';
  robot: string;
}

export interface SimRobot {
  key: string;
  name: string;
  root: string;
  floating: boolean;
  joints: string[];
}

export interface SimModel {
  xml: string;
  bodies: SimBody[];
  joints: SimJoint[];
  robots: SimRobot[];
  initial: RobotPoseState;
  massKg: Record<string, number>;
  warnings: string[];
}

export interface MjcfInput {
  parts: ScenePart[];
  rig: Rig;
  project: ProjectSettings;
  pose?: RobotPoseState;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
  posedFloor?: number | null;
  fixedBase?: Record<string, boolean>;
  timestep?: number;
}

const f = (n: number) => {
  const r = Math.round(n * 1e6) / 1e6;

  return Object.is(r, -0) ? '0' : String(r);
};
const vec = (v: number[]) => v.map(f).join(' ');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const LEG = /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe/i;

function hullVertices(tris: Float32Array, place: THREE.Matrix4, origin: V3): number[] | null {
  const pts: THREE.Vector3[] = [];
  const seen = new Set<string>();
  const v = new THREE.Vector3();
  const box = new THREE.Box3();

  for (let i = 0; i < tris.length; i += 3) box.expandByPoint(v.set(tris[i], tris[i + 1], tris[i + 2]));

  const cell = Math.max(box.getSize(new THREE.Vector3()).length() / 160, 1e-3);

  for (let i = 0; i < tris.length; i += 3) {
    v.set(tris[i], tris[i + 1], tris[i + 2]);

    const k = `${Math.round(v.x / cell)},${Math.round(v.y / cell)},${Math.round(v.z / cell)}`;

    if (seen.has(k)) continue;

    seen.add(k);
    pts.push(v.clone().applyMatrix4(place));
  }

  if (pts.length < 4) return null;

  let hull: ConvexHull;

  try {
    hull = new ConvexHull().setFromPoints(pts);
  } catch {
    return null;
  }

  const out: number[] = [];
  const used = new Set<object>();

  for (const face of hull.faces) {
    let e = face.edge;

    do {
      if (!used.has(e.head())) {
        used.add(e.head());

        const p = e.head().point;
        const m = toMj([p.x - origin[0], p.y - origin[1], p.z - origin[2]]);

        out.push(...m);
      }

      e = e.next;
    } while (e !== face.edge);
  }

  return out.length >= 12 ? out : null;
}

type PartMass = ReturnType<typeof partMasses>[number];

interface BuildState {
  input: MjcfInput;
  byId: Map<string, ScenePart>;
  masses: Map<string, PartMass>;
  assets: string[];
  bodies: SimBody[];
  simJoints: SimJoint[];
  robots: SimRobot[];
  massKg: Record<string, number>;
  initialValues: Record<string, number>;
  roots: Record<string, { position?: V3; rotation?: V3 }>;
  worldXml: string[];
  actuatorXml: string[];
  warnings: string[];
  lift: number;
}

interface RobotBuild {
  st: BuildState;
  robot: Rig['robots'][number];
  children: Map<string, RobotJoint[]>;
  local: RobotPoseState;
  grams: number;
}

interface BodySpec {
  name: string;
  origin: V3;
  parentOrigin: V3;
  ids: string[];
  inner: string[];
  indent: string;
}

const isSolidPart = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

const safeId = (id: string) => id.replace(/\W/g, '_').slice(0, 40);

function robotGrams(m: PartMass | undefined, measure: MeshMeasure | undefined): number {
  if (m) return m.grams;

  if (measure) return (measure.volumeMm3 / 1000) * 0.6;

  return 10;
}

function geomFor(st: BuildState, p: ScenePart, origin: V3, robot: boolean): string | null {
  const tris = st.input.partTriangles(p.id);
  const place = partMatrix(p);
  const verts = tris && tris.length >= 9 ? hullVertices(tris, place, origin) : null;
  const kg = robot ? robotGrams(st.masses.get(p.id), st.input.measures[p.id]) / 1000 : 0;
  const massAttr = robot ? ` mass="${f(Math.max(kg, 1e-4))}"` : '';
  const contact = robot ? 'contype="1" conaffinity="0"' : 'contype="0" conaffinity="1"';
  const name = `g_${p.id.replace(/[^\w-]/g, '_')}`;

  if (verts) {
    const mesh = `m${st.assets.length}_${safeId(p.id)}`;

    st.assets.push(`    <mesh name="${mesh}" vertex="${vec(verts)}" maxhullvert="96" inertia="convex"/>`);

    return `<geom name="${esc(name)}" type="mesh" mesh="${mesh}" ${contact}${massAttr}/>`;
  }

  const d = p.dimensions;
  const center = new THREE.Vector3().applyMatrix4(place);
  const q = new THREE.Quaternion().setFromRotationMatrix(place);
  const pos = toMj([center.x - origin[0], center.y - origin[1], center.z - origin[2]]);
  const half = [Math.max(d.width, 1) / 2000, Math.max(d.depth, 1) / 2000, Math.max(d.height, 1) / 2000];

  return `<geom name="${esc(name)}" type="box" size="${vec(half)}" pos="${vec(pos)}" quat="${vec(quatToMj(q))}" ${contact}${massAttr}/>`;
}

function solidPart(st: BuildState, id: string): boolean {
  const p = st.byId.get(id);

  return !!p && isSolidPart(p);
}

function bodyXml(rb: RobotBuild, b: BodySpec): string[] {
  const { st } = rb;
  const { origin, parentOrigin, indent } = b;
  const pos = toMj([origin[0] - parentOrigin[0], origin[1] - parentOrigin[1], origin[2] - parentOrigin[2]]);

  st.bodies.push({ name: b.name, parts: b.ids, origin });

  const lines = [`${indent}<body name="${esc(b.name)}" pos="${vec(pos)}">`];

  lines.push(...b.inner.map((l) => `${indent}  ${l}`));

  for (const id of b.ids) {
    const g = geomFor(st, st.byId.get(id)!, origin, true);

    if (g) lines.push(`${indent}  ${g}`);

    rb.grams += st.masses.get(id)?.grams ?? 0;
  }

  return lines;
}

function movableJointXml(rb: RobotBuild, j: RobotJoint, name: string): string {
  const { st } = rb;
  const axis = toMj(j.axis).map((v) => v * 1000);
  const revolute = j.type === 'revolute';
  const toUnit = (v: number) => (revolute ? THREE.MathUtils.degToRad(v) : v / 1000);
  const range = j.range ? [Math.min(...j.range), Math.max(...j.range)] : null;
  const { effort, source } = effortOf(j, st.byId, st.input.rig, st.masses);
  const armature = revolute ? Math.max(0.002, effort * 0.004) : 0.05;
  const jointLine = `<joint name="${name}" type="${revolute ? 'hinge' : 'slide'}" axis="${vec(axis)}"${range ? ` range="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : ''} damping="${f(effort * 0.02)}" armature="${f(armature)}" frictionloss="${f(effort * 0.01)}"/>`;
  const kp = effort / (revolute ? 0.17 : 0.005);
  const ctrl = range ? ` ctrlrange="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';

  st.actuatorXml.push(
    `    <position name="${name}" joint="${name}" kp="${f(kp)}" dampratio="1" forcerange="${f(-effort)} ${f(effort)}"${ctrl}/>`,
  );
  st.simJoints.push({
    id: j.id,
    name,
    type: j.type as 'revolute' | 'prismatic',
    range: j.range,
    effort,
    effortSource: source,
    robot: rb.robot.key,
  });

  const v = rb.local.values[j.id];

  if (v) st.initialValues[j.id] = clampJoint(j, v);

  return jointLine;
}

function jointParts(st: BuildState, jointId: string): string[] {
  return [...st.input.rig.ownerOf]
    .filter(([pid, owner]) => owner === jointId && solidPart(st, pid))
    .map(([pid]) => pid);
}

function emitJoint(rb: RobotBuild, j: RobotJoint, parentOrigin: V3, indent: string): string[] {
  const { st } = rb;
  const name = `j${st.simJoints.length}_${safeId(j.id)}`;
  const inner = isMovable(j) ? [movableJointXml(rb, j, name)] : [];
  const lines = bodyXml(rb, {
    name: `b_${name}`,
    origin: j.origin,
    parentOrigin,
    ids: jointParts(st, j.id),
    inner,
    indent,
  });

  for (const c of rb.children.get(j.id) ?? []) lines.push(...emitJoint(rb, c, j.origin, indent + '  '));

  lines.push(`${indent}</body>`);

  return lines;
}

function childrenByParent(rig: Rig, joints: RobotJoint[]): Map<string, RobotJoint[]> {
  const children = new Map<string, RobotJoint[]>();

  for (const j of joints) {
    const parent = rig.parentOf.get(j.id) ?? '';

    children.set(parent, [...(children.get(parent) ?? []), j]);
  }

  return children;
}

function isLegJoint(j: RobotJoint): boolean {
  return isMovable(j) && (j.limb === 'leg' || LEG.test(j.name) || LEG.test(j.id));
}

function rootState(local: RobotPoseState, rootOrigin: V3, lift: number): { position?: V3; rotation?: V3 } {
  const start: V3 = [rootOrigin[0], rootOrigin[1] + lift, rootOrigin[2]];
  const state: { position?: V3; rotation?: V3 } = {
    position: [0, start[1] - rootOrigin[1], 0],
    ...(local.root?.rotation ? { rotation: local.root.rotation } : {}),
  };
  const p = local.root?.position;

  if (p) state.position = [p[0], (p[1] ?? 0) + lift, p[2]];

  return state;
}

function emitRobot(st: BuildState, robot: Rig['robots'][number]) {
  const { rig } = st.input;
  const joints = rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key);
  const base = [...robot.parts].filter((id) => !rig.ownerOf.has(id) && solidPart(st, id));
  const floating = !(st.input.fixedBase?.[robot.key] ?? !joints.some(isLegJoint));
  const rootName = `root_${st.robots.length}`;
  const rootOrigin = robot.pivot;
  const rb: RobotBuild = {
    st,
    robot,
    children: childrenByParent(rig, joints),
    local: robotPose(rig, st.input.pose, robot.key),
    grams: 0,
  };
  const rootLines = bodyXml(rb, {
    name: rootName,
    origin: rootOrigin,
    parentOrigin: [0, 0, 0],
    ids: base,
    inner: floating ? ['<freejoint name="' + rootName + '"/>'] : [],
    indent: '    ',
  });

  for (const c of rb.children.get('') ?? []) rootLines.push(...emitJoint(rb, c, rootOrigin, '      '));

  rootLines.push('    </body>');
  st.worldXml.push(...rootLines);
  st.robots.push({
    key: robot.key,
    name: robot.name,
    root: rootName,
    floating,
    joints: st.simJoints.filter((j) => j.robot === robot.key).map((j) => j.id),
  });
  st.massKg[robot.key] = rb.grams / 1000;

  if (floating) st.roots[robot.key] = rootState(rb.local, rootOrigin, st.lift);

  if (!rb.grams) st.warnings.push(`${robot.name} has no weighed parts. Its weight is an estimate.`);
}

function mujocoXml(st: BuildState, timestep: number): string {
  return `<mujoco model="basecase">
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  <option timestep="${f(timestep)}" integrator="implicitfast"/>
  <default>
    <geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/>
  </default>
  <asset>
${st.assets.join('\n')}
  </asset>
  <worldbody>
    <light pos="0 0 3" dir="0 0 -1" directional="true"/>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
${st.worldXml.join('\n')}
  </worldbody>
  <actuator>
${st.actuatorXml.join('\n')}
  </actuator>
</mujoco>
`;
}

export function buildMjcf(input: MjcfInput): SimModel {
  const { parts, rig, project } = input;
  const st: BuildState = {
    input,
    byId: new Map(parts.map((p) => [p.id, p])),
    masses: new Map(partMasses(parts, project, input.measures).map((m) => [m.id, m])),
    assets: [],
    bodies: [],
    simJoints: [],
    robots: [],
    massKg: {},
    initialValues: {},
    roots: {},
    worldXml: [],
    actuatorXml: [],
    warnings: [],
    lift: input.posedFloor != null ? Math.max(0, -input.posedFloor) + 2 : 0,
  };

  for (const robot of rig.robots) emitRobot(st, robot);

  const inRobot = new Set(rig.robots.flatMap((r) => [...r.parts]));

  for (const p of parts) {
    if (inRobot.has(p.id) || !isSolidPart(p)) continue;

    const g = geomFor(st, p, [0, 0, 0], false);

    if (g) st.worldXml.push(`    ${g}`);
  }

  const xml = mujocoXml(st, input.timestep ?? 0.002);

  return {
    xml,
    bodies: st.bodies,
    joints: st.simJoints,
    robots: st.robots,
    initial: { values: st.initialValues, roots: st.roots },
    massKg: st.massKg,
    warnings: st.warnings,
  };
}

function effortOf(
  j: RobotJoint,
  byId: Map<string, ScenePart>,
  rig: Rig,
  masses: Map<string, { grams: number; centroid: V3 }>,
): { effort: number; source: SimJoint['effortSource'] } {
  const servos = (j.actuators ?? []).map((id) => byId.get(id)).filter((p): p is ScenePart => !!p?.componentId);
  const stall = servos.reduce((s, p) => s + (actuatorOf(p.componentId!, p.componentVariant)?.stallNm ?? 0), 0);

  if (stall > 0) return { effort: stall, source: 'servo' };

  if (j.effortNm && j.effortNm > 0) return { effort: j.effortNm, source: 'published' };

  const below = new Set<string>();

  for (const [pid, owner] of rig.ownerOf) if (rig.chain.get(owner)?.has(j.id)) below.add(pid);

  let moment = 0;
  let grams = 0;

  for (const id of below) {
    const m = masses.get(id);

    if (!m) continue;

    grams += m.grams;
    moment +=
      (m.grams / 1000) *
      9.81 *
      (Math.hypot(m.centroid[0] - j.origin[0], m.centroid[1] - j.origin[1], m.centroid[2] - j.origin[2]) / 1000);
  }

  if (j.type === 'prismatic') return { effort: Math.max(5, (grams / 1000) * 9.81 * 3), source: 'estimate' };

  return { effort: Math.max(0.3, moment * 3), source: 'estimate' };
}
