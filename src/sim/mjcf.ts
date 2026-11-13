import * as THREE from 'three';
import type { MeshMeasure } from '../three/meshMeasure';
import type { RobotJoint, RobotPoseState, ScenePart } from '../types/robotics';
import { partMasses } from '../utils/engineering';
import { clampJoint, isMovable, partMatrix, robotPose, type Rig, type V3 } from '../utils/kinematics';
import { effortOf } from './mjcfEffort';
import { robotFingerprint } from './mjcfFingerprint';
import { quatToMj, toMj } from './mjcfFrames';
import { cachedHull } from './mjcfHull';
import { fittedActuatorXml, fittedJointAttrs, fittedServo } from './mjcfServo';
import { esc, f, safeId, vec } from './mjcfText';
import {
  SIM_MODEL_VERSION,
  type MjcfInput,
  type SimBody,
  type SimJoint,
  type SimModel,
  type SimRobot,
} from './mjcfTypes';
import { adoptEmbeddedParts, isSolidPart } from './mjcfEmbedded';
import { emitWorld } from './mjcfWorld';
import { classifyRobot, isWheelJoint } from './morphology';

export { fromMj, quatFromMj, quatToMj, simDeltas, toMj, worldDeltas } from './mjcfFrames';
export { SIM_MODEL_VERSION } from './mjcfTypes';
export type { MjcfInput, SimBody, SimDrive, SimJoint, SimModel, SimRobot, WorldItem } from './mjcfTypes';

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
  parent: { name?: string; origin: V3 };
  joint?: string;
  ids: string[];
  inner: string[];
  indent: string;
}

function robotGrams(m: PartMass | undefined, measure: MeshMeasure | undefined): number {
  if (m) return m.grams;

  if (measure) return (measure.volumeMm3 / 1000) * 0.6;

  return 10;
}

interface ActuatorSpecXml {
  name: string;
  effort: number;
  revolute: boolean;
  range: [number, number] | null;
  wheel: boolean;
}

const WHEEL_FULL_TORQUE_SPEED = 2;
const DEFAULT_TIMESTEP = 0.002;

type GeomRole = 'robot' | 'object' | 'scenery';

const CONTACT: Record<GeomRole, string> = {
  robot: 'contype="1" conaffinity="0"',
  object: 'contype="1" conaffinity="1"',
  scenery: 'contype="0" conaffinity="1"',
};

function geomAttrs(st: BuildState, p: ScenePart, role: GeomRole): string {
  const kg = role === 'scenery' ? 0 : robotGrams(st.masses.get(p.id), st.input.measures[p.id]) / 1000;
  const massAttr = role === 'scenery' ? '' : ` mass="${f(Math.max(kg, 1e-4))}"`;
  const friction =
    role === 'object' && p.physics?.friction ? ` priority="1" friction="${f(p.physics.friction)} 0.02 0.002"` : '';

  return `${CONTACT[role]}${massAttr}${friction}`;
}

function geomFor(st: BuildState, p: ScenePart, origin: V3, role: GeomRole): string | null {
  const tris = st.input.partTriangles(p.id);
  const place = partMatrix(p);
  const verts = tris && tris.length >= 9 ? cachedHull(p, tris, origin) : null;
  const attrs = geomAttrs(st, p, role);
  const name = `g_${p.id.replace(/[^\w-]/g, '_')}`;

  if (verts) {
    const mesh = `m${st.assets.length}_${safeId(p.id)}`;

    st.assets.push(`    <mesh name="${mesh}" vertex="${vec(verts)}" maxhullvert="96" inertia="convex"/>`);

    return `<geom name="${esc(name)}" type="mesh" mesh="${mesh}" ${attrs}/>`;
  }

  const d = p.dimensions;
  const center = new THREE.Vector3().applyMatrix4(place);
  const q = new THREE.Quaternion().setFromRotationMatrix(place);
  const pos = toMj([center.x - origin[0], center.y - origin[1], center.z - origin[2]]);
  const half = [Math.max(d.width, 1) / 2000, Math.max(d.depth, 1) / 2000, Math.max(d.height, 1) / 2000];

  return `<geom name="${esc(name)}" type="box" size="${vec(half)}" pos="${vec(pos)}" quat="${vec(quatToMj(q))}" ${attrs}/>`;
}

function solidPart(st: BuildState, id: string): boolean {
  const p = st.byId.get(id);

  return !!p && isSolidPart(p);
}

function bodyXml(rb: RobotBuild, b: BodySpec): string[] {
  const { st } = rb;
  const { origin, parent, indent } = b;
  const pos = toMj([origin[0] - parent.origin[0], origin[1] - parent.origin[1], origin[2] - parent.origin[2]]);

  st.bodies.push({
    name: b.name,
    parts: b.ids,
    origin,
    robot: rb.robot.key,
    ...(parent.name ? { parent: parent.name } : {}),
    ...(b.joint ? { joint: b.joint } : {}),
  });

  const lines = [`${indent}<body name="${esc(b.name)}" pos="${vec(pos)}">`];

  lines.push(...b.inner.map((l) => `${indent}  ${l}`));

  for (const id of b.ids) {
    const g = geomFor(st, st.byId.get(id)!, origin, 'robot');

    if (g) lines.push(`${indent}  ${g}`);

    rb.grams += st.masses.get(id)?.grams ?? 0;
  }

  return lines;
}

function actuatorXml(spec: ActuatorSpecXml): string {
  const { name, effort, revolute, range, wheel } = spec;
  const toUnit = (v: number) => (revolute ? THREE.MathUtils.degToRad(v) : v / 1000);
  const force = `forcerange="${f(-effort)} ${f(effort)}"`;

  if (wheel)
    return `    <velocity name="${name}" joint="${name}" kv="${f(effort / WHEEL_FULL_TORQUE_SPEED)}" ${force}/>`;

  const kp = effort / (revolute ? 0.17 : 0.005);
  const ctrl = range ? ` ctrlrange="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';

  return `    <position name="${name}" joint="${name}" kp="${f(kp)}" dampratio="1" ${force}${ctrl}/>`;
}

function estimatedJointAttrs(effort: number, revolute: boolean): string {
  const armature = revolute ? Math.max(0.002, effort * 0.004) : 0.05;

  return `damping="${f(effort * 0.02)}" armature="${f(armature)}" frictionloss="${f(effort * 0.01)}"`;
}

function movableJointXml(rb: RobotBuild, j: RobotJoint, name: string): string {
  const { st } = rb;
  const axis = toMj(j.axis).map((v) => v * 1000);
  const revolute = j.type === 'revolute';
  const toUnit = (v: number) => (revolute ? THREE.MathUtils.degToRad(v) : v / 1000);
  const range = j.range ? ([Math.min(...j.range), Math.max(...j.range)] as [number, number]) : null;
  const wheel = isWheelJoint(j, st.byId, st.input.rig);
  const calibrated = st.input.servoFits?.[j.id];
  const servo = wheel ? null : fittedServo({ j, byId: st.byId, rig: st.input.rig, masses: st.masses, calibrated });
  const { effort, source } = servo
    ? { effort: servo.forceNm, source: 'servo' as const }
    : effortOf(j, st.byId, st.input.rig, st.masses);
  const rangeAttr = range ? ` range="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';
  const jointLine = `<joint name="${name}" type="${revolute ? 'hinge' : 'slide'}" axis="${vec(axis)}"${rangeAttr} ${servo ? fittedJointAttrs(servo) : estimatedJointAttrs(effort, revolute)}/>`;
  const ctrlrange = range ? ` ctrlrange="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';

  st.actuatorXml.push(
    servo
      ? fittedActuatorXml({ name, dynamics: servo, ctrlrange, timestep: st.input.timestep ?? DEFAULT_TIMESTEP })
      : actuatorXml({ name, effort, revolute, range, wheel }),
  );
  st.simJoints.push({
    id: j.id,
    name,
    type: j.type as 'revolute' | 'prismatic',
    range: j.range,
    effort,
    effortSource: source,
    dynamics: servo ? 'measured' : 'estimated',
    robot: rb.robot.key,
    drive: wheel ? 'velocity' : 'position',
    actuator: st.actuatorXml.length - 1,
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

function emitJoint(rb: RobotBuild, j: RobotJoint, parent: BodySpec['parent'], indent: string): string[] {
  const { st } = rb;
  const name = `j${st.simJoints.length}_${safeId(j.id)}`;
  const inner = isMovable(j) ? [movableJointXml(rb, j, name)] : [];
  const body = { name: `b_${name}`, origin: j.origin };
  const lines = bodyXml(rb, { ...body, parent, joint: j.id, ids: jointParts(st, j.id), inner, indent });

  for (const c of rb.children.get(j.id) ?? []) lines.push(...emitJoint(rb, c, body, indent + '  '));

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
  const morphology = classifyRobot(robot, st.input.rig, st.byId);
  const floating = !(st.input.fixedBase?.[robot.key] ?? morphology === 'fixed');
  const rootName = `root_${st.robots.length}`;
  const rootOrigin = robot.pivot;
  const [assetsFrom, actuatorsFrom] = [st.assets.length, st.actuatorXml.length];
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
    parent: { origin: [0, 0, 0] },
    ids: base,
    inner: floating ? ['<freejoint name="' + rootName + '"/>'] : [],
    indent: '    ',
  });

  const rootBody = { name: rootName, origin: rootOrigin };

  for (const c of rb.children.get('') ?? []) rootLines.push(...emitJoint(rb, c, rootBody, '      '));

  rootLines.push('    </body>');
  st.worldXml.push(...rootLines);
  st.robots.push({
    key: robot.key,
    name: robot.name,
    root: rootName,
    floating,
    morphology,
    joints: st.simJoints.filter((j) => j.robot === robot.key).map((j) => j.id),
    fingerprint: robotFingerprint({
      timestep: st.input.timestep ?? DEFAULT_TIMESTEP,
      assets: st.assets.slice(assetsFrom),
      body: rootLines,
      actuators: st.actuatorXml.slice(actuatorsFrom),
    }),
  });
  st.massKg[robot.key] = rb.grams / 1000;

  if (floating) st.roots[robot.key] = rootState(rb.local, rootOrigin, st.lift);

  if (!rb.grams) st.warnings.push(`${robot.name} has no weighed parts. Its weight is an estimate.`);
}

function objectGroups(parts: ScenePart[]): string[][] {
  const groups = new Map<string, string[]>();

  for (const p of parts) {
    const key = p.group?.id ?? p.id;

    groups.set(key, [...(groups.get(key) ?? []), p.id]);
  }

  return [...groups.values()];
}

function emitObject(st: BuildState, ids: string[], index: number) {
  const placed = ids.map((id) => st.byId.get(id)!);
  const origin = [0, 1, 2].map((a) => placed.reduce((s, p) => s + p.position[a], 0) / placed.length) as V3;
  const name = `o${index}_${safeId(ids[0])}`;
  const lines = [`    <body name="${esc(name)}" pos="${vec(toMj(origin))}">`, `      <freejoint name="${esc(name)}"/>`];

  st.bodies.push({ name, parts: ids, origin });

  for (const p of placed) {
    const g = geomFor(st, p, origin, 'object');

    if (g) lines.push(`      ${g}`);
  }

  lines.push('    </body>');
  st.worldXml.push(...lines);
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

export function buildMjcf(given: MjcfInput): SimModel {
  const input = { ...given, rig: adoptEmbeddedParts(given.rig, given.parts, given.partTriangles) };
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
  const loose = parts.filter((p) => !inRobot.has(p.id) && isSolidPart(p));

  for (const p of loose.filter((q) => !q.physics?.dynamic)) {
    const g = geomFor(st, p, [0, 0, 0], 'scenery');

    if (g) st.worldXml.push(`    ${g}`);
  }

  objectGroups(loose.filter((q) => q.physics?.dynamic)).forEach((ids, i) => emitObject(st, ids, i));

  const world = emitWorld(input, st.assets.length);

  st.assets.push(...world.assets);
  st.worldXml.push(...world.lines);
  st.bodies.push(...world.bodies);

  const xml = mujocoXml(st, input.timestep ?? DEFAULT_TIMESTEP);

  return {
    version: SIM_MODEL_VERSION,
    xml,
    bodies: st.bodies,
    joints: st.simJoints,
    robots: st.robots,
    initial: { values: st.initialValues, roots: st.roots },
    massKg: st.massKg,
    warnings: st.warnings,
  };
}
