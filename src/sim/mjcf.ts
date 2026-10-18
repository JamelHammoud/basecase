/**
 * The scene as a MuJoCo model (MJCF). Each robot becomes a body tree built from its joints:
 * one body per joint, holding the parts that joint moves, under a root body that holds the
 * robot's base. Every other solid part is fixed scenery. Parts collide as convex hulls of their
 * own meshes, weigh what the Build checks say they weigh (inertia from the hull), and every
 * movable joint gets a position actuator, like a servo, limited to its torque.
 *
 * Frames: MuJoCo is Z up in meters; the scene is Y up in mm (the agent frame: scene (x, y, z) →
 * MuJoCo (x, −z, y)). Bodies keep the world's orientation at rest, so a body's frame is just its
 * joint's pivot and the scene's rest pose maps back without rotations.
 */
import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { actuatorOf } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, RobotPoseState, ScenePart } from '../types/robotics';
import { partMasses } from '../utils/engineering';
import { clampJoint, isMovable, partMatrix, robotPose, type Rig, type V3 } from '../utils/kinematics';

/** Scene (mm, Y up) → MuJoCo (m, Z up) */
export const toMj = (v: V3 | THREE.Vector3): V3 => {
  const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];
  return [x / 1000, -z / 1000, y / 1000];
};
/** MuJoCo (m, Z up) → scene (mm, Y up) */
export const fromMj = (x: number, y: number, z: number): V3 => [x * 1000, z * 1000, -y * 1000];
/** A MuJoCo quaternion (w, x, y, z) as a scene rotation */
export function quatFromMj(w: number, x: number, y: number, z: number, out = new THREE.Quaternion()): THREE.Quaternion {
  // Same rotation, axes renamed: MuJoCo (x, y, z) are scene (x, −z, y)
  return out.set(x, z, -y, w);
}
/** A scene rotation as a MuJoCo quaternion (w, x, y, z) */
export const quatToMj = (q: THREE.Quaternion): [number, number, number, number] => [q.w, q.x, -q.z, q.y];

export interface SimBody {
  /** MuJoCo body name */
  name: string;
  /** Scene parts it carries */
  parts: string[];
  /** Body frame at rest (scene mm); bodies keep the world's orientation at rest */
  origin: V3;
}

export interface SimJoint {
  id: string;
  /** MuJoCo joint and actuator name */
  name: string;
  type: 'revolute' | 'prismatic';
  /** Joint value range, degrees or mm */
  range?: [number, number];
  /** Torque (N·m) or force (N) limit of its actuator */
  effort: number;
  /** Where the limit comes from */
  effortSource: 'servo' | 'published' | 'estimate';
  robot: string;
}

export interface SimRobot {
  key: string;
  name: string;
  /** The root body: free (it can fall) or welded to the floor (arms) */
  root: string;
  floating: boolean;
  joints: string[];
}

export interface SimModel {
  xml: string;
  bodies: SimBody[];
  joints: SimJoint[];
  robots: SimRobot[];
  /** Initial joint values (degrees / mm) and root offsets, from the pose on the canvas */
  initial: RobotPoseState;
  /** Total mass by robot, kg */
  massKg: Record<string, number>;
  warnings: string[];
}

export interface MjcfInput {
  parts: ScenePart[];
  rig: Rig;
  project: ProjectSettings;
  pose?: RobotPoseState;
  measures: Record<string, MeshMeasure | undefined>;
  /** A part's triangles in its own frame (scale kept), mm */
  partTriangles: (id: string) => Float32Array | null;
  /** Lowest point of the posed robot (scene y), to start it just above the floor */
  posedFloor?: number | null;
  /** Robots welded to the floor; by default robots with legs float and the rest are welded */
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

/**
 * Convex hull of a part's rest-pose mesh, in MuJoCo meters relative to `origin` (scene mm).
 * Hull vertices only: MuJoCo rebuilds the hull from them.
 */
function hullVertices(tris: Float32Array, place: THREE.Matrix4, origin: V3): number[] | null {
  const pts: THREE.Vector3[] = [];
  // Big meshes: a coarse grid keeps one point per cell, enough for a collision hull
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

export function buildMjcf(input: MjcfInput): SimModel {
  const { parts, rig, project } = input;
  const warnings: string[] = [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const masses = new Map(partMasses(parts, project, input.measures).map((m) => [m.id, m]));
  const solid = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

  const assets: string[] = [];
  const meshName = (id: string) => `m${assets.length}_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`;

  /** Geoms for a part, relative to its body's origin; null when it has no usable mesh */
  const geomFor = (p: ScenePart, origin: V3, robot: boolean): string | null => {
    const tris = input.partTriangles(p.id);
    const place = partMatrix(p);
    const verts = tris && tris.length >= 9 ? hullVertices(tris, place, origin) : null;
    const m = masses.get(p.id);
    // Parts the Build checks don't weigh (hand-modeled odds and ends): a light plastic estimate
    const measure = input.measures[p.id];
    const kg = robot ? (m ? m.grams : measure ? (measure.volumeMm3 / 1000) * 0.6 : 10) / 1000 : 0;
    const massAttr = robot ? ` mass="${f(Math.max(kg, 1e-4))}"` : '';
    const contact = robot ? 'contype="1" conaffinity="0"' : 'contype="0" conaffinity="1"';
    const name = `g_${p.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    if (verts) {
      const mesh = meshName(p.id);
      assets.push(`    <mesh name="${mesh}" vertex="${vec(verts)}" maxhullvert="96" inertia="convex"/>`);
      return `<geom name="${esc(name)}" type="mesh" mesh="${mesh}" ${contact}${massAttr}/>`;
    }
    // No mesh to hull (a flat or empty part): its size as a box
    const d = p.dimensions;
    const center = new THREE.Vector3().applyMatrix4(place);
    const q = new THREE.Quaternion().setFromRotationMatrix(place);
    const pos = toMj([center.x - origin[0], center.y - origin[1], center.z - origin[2]]);
    const half = [Math.max(d.width, 1) / 2000, Math.max(d.depth, 1) / 2000, Math.max(d.height, 1) / 2000];
    return `<geom name="${esc(name)}" type="box" size="${vec(half)}" pos="${vec(pos)}" quat="${vec(quatToMj(q))}" ${contact}${massAttr}/>`;
  };

  const bodies: SimBody[] = [];
  const simJoints: SimJoint[] = [];
  const robots: SimRobot[] = [];
  const massKg: Record<string, number> = {};
  const initialValues: Record<string, number> = {};
  const roots: Record<string, { position?: V3; rotation?: V3 }> = {};
  const worldXml: string[] = [];
  const actuatorXml: string[] = [];
  const pose = input.pose;
  // Start just above the floor, wherever the canvas pose puts the feet
  const lift = input.posedFloor != null ? Math.max(0, -input.posedFloor) + 2 : 0;

  for (const robot of rig.robots) {
    const joints = rig.joints.filter((j) => rig.robotOf.get(j.id) === robot.key);
    const base = [...robot.parts].filter((id) => !rig.ownerOf.has(id) && byId.get(id) && solid(byId.get(id)!));
    const legged = joints.some((j) => isMovable(j) && (j.limb === 'leg' || LEG.test(j.name) || LEG.test(j.id)));
    const floating = !(input.fixedBase?.[robot.key] ?? !legged);
    const rootName = `root_${robots.length}`;
    const rootOrigin = robot.pivot;
    const local = robotPose(rig, pose, robot.key);
    let grams = 0;

    const children = new Map<string, RobotJoint[]>();
    for (const j of joints) {
      const parent = rig.parentOf.get(j.id) ?? '';
      children.set(parent, [...(children.get(parent) ?? []), j]);
    }
    const partsOf = (jointId: string) => [...rig.ownerOf].filter(([pid, owner]) => owner === jointId && byId.get(pid) && solid(byId.get(pid)!)).map(([pid]) => pid);
    const bodyXml = (name: string, origin: V3, parentOrigin: V3, ids: string[], inner: string[], indent: string): string[] => {
      const pos = toMj([origin[0] - parentOrigin[0], origin[1] - parentOrigin[1], origin[2] - parentOrigin[2]]);
      bodies.push({ name, parts: ids, origin });
      const lines = [`${indent}<body name="${esc(name)}" pos="${vec(pos)}">`];
      lines.push(...inner.map((l) => `${indent}  ${l}`));
      for (const id of ids) {
        const g = geomFor(byId.get(id)!, origin, true);
        if (g) lines.push(`${indent}  ${g}`);
        grams += masses.get(id)?.grams ?? 0;
      }
      return lines;
    };

    const emit = (j: RobotJoint, parentOrigin: V3, indent: string): string[] => {
      const name = `j${simJoints.length}_${j.id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}`;
      const inner: string[] = [];
      if (isMovable(j)) {
        const axis = toMj(j.axis).map((v) => v * 1000);
        const revolute = j.type === 'revolute';
        const toUnit = (v: number) => (revolute ? THREE.MathUtils.degToRad(v) : v / 1000);
        const range = j.range ? [Math.min(...j.range), Math.max(...j.range)] : null;
        const { effort, source } = effortOf(j, byId, rig, masses);
        // Gearboxes add reflected inertia: it keeps light links stable at a 2 ms step
        const armature = revolute ? Math.max(0.002, effort * 0.004) : 0.05;
        inner.push(
          `<joint name="${name}" type="${revolute ? 'hinge' : 'slide'}" axis="${vec(axis)}"${range ? ` range="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : ''} damping="${f(effort * 0.02)}" armature="${f(armature)}" frictionloss="${f(effort * 0.01)}"/>`
        );
        // A servo: stiff enough to reach its full torque about 10° (or 5 mm) off target
        const kp = effort / (revolute ? 0.17 : 0.005);
        const ctrl = range ? ` ctrlrange="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';
        actuatorXml.push(
          `    <position name="${name}" joint="${name}" kp="${f(kp)}" dampratio="1" forcerange="${f(-effort)} ${f(effort)}"${ctrl}/>`
        );
        simJoints.push({ id: j.id, name, type: j.type as 'revolute' | 'prismatic', range: j.range, effort, effortSource: source, robot: robot.key });
        const v = local.values[j.id];
        if (v) initialValues[j.id] = clampJoint(j, v);
      }
      const lines = bodyXml(`b_${name}`, j.origin, parentOrigin, partsOf(j.id), inner, indent);
      for (const c of children.get(j.id) ?? []) lines.push(...emit(c, j.origin, indent + '  '));
      lines.push(`${indent}</body>`);
      return lines;
    };

    const start: V3 = [rootOrigin[0], rootOrigin[1] + lift, rootOrigin[2]];
    const rootLines = bodyXml(rootName, rootOrigin, [0, 0, 0], base, floating ? ['<freejoint name="' + rootName + '"/>'] : [], '    ');
    // The body's pos is its rest place; the lift goes in the initial state so "Reset" lands the same way
    for (const c of children.get('') ?? []) rootLines.push(...emit(c, rootOrigin, '      '));
    rootLines.push('    </body>');
    worldXml.push(...rootLines);
    robots.push({ key: robot.key, name: robot.name, root: rootName, floating, joints: simJoints.filter((j) => j.robot === robot.key).map((j) => j.id) });
    massKg[robot.key] = grams / 1000;
    if (floating) roots[robot.key] = { position: [0, start[1] - rootOrigin[1], 0], ...(local.root?.rotation ? { rotation: local.root.rotation } : {}) };
    if (local.root?.position && floating) roots[robot.key].position = [local.root.position[0], (local.root.position[1] ?? 0) + lift, local.root.position[2]];
    if (!grams) warnings.push(`${robot.name} has no weighed parts. Its weight is an estimate.`);
  }

  // Everything that isn't a robot: fixed scenery the robot can stand on or bump into
  const inRobot = new Set(rig.robots.flatMap((r) => [...r.parts]));
  for (const p of parts) {
    if (inRobot.has(p.id) || !solid(p)) continue;
    const g = geomFor(p, [0, 0, 0], false);
    if (g) worldXml.push(`    ${g}`);
  }

  const timestep = input.timestep ?? 0.002;
  const xml = `<mujoco model="basecase">
  <compiler angle="radian" inertiafromgeom="true" boundmass="0.0005" boundinertia="1e-8"/>
  <option timestep="${f(timestep)}" integrator="implicitfast"/>
  <default>
    <geom friction="0.9 0.02 0.002" solref="0.004 1" condim="3"/>
  </default>
  <asset>
${assets.join('\n')}
  </asset>
  <worldbody>
    <light pos="0 0 3" dir="0 0 -1" directional="true"/>
    <geom name="floor" type="plane" size="0 0 0.05" contype="0" conaffinity="1"/>
${worldXml.join('\n')}
  </worldbody>
  <actuator>
${actuatorXml.join('\n')}
  </actuator>
</mujoco>
`;
  return { xml, bodies, joints: simJoints, robots, initial: { values: initialValues, roots }, massKg, warnings };
}

/**
 * A joint's torque limit: its servos' stall torque, the maker's published limit, or an estimate
 * from the weight it carries (enough to hold it out level at about 3× margin)
 */
function effortOf(
  j: RobotJoint,
  byId: Map<string, ScenePart>,
  rig: Rig,
  masses: Map<string, { grams: number; centroid: V3 }>
): { effort: number; source: SimJoint['effortSource'] } {
  const servos = (j.actuators ?? []).map((id) => byId.get(id)).filter((p): p is ScenePart => !!p?.componentId);
  const stall = servos.reduce((s, p) => s + (actuatorOf(p.componentId!, p.componentVariant)?.stallNm ?? 0), 0);
  if (stall > 0) return { effort: stall, source: 'servo' };
  if (j.effortNm && j.effortNm > 0) return { effort: j.effortNm, source: 'published' };
  // Everything below this joint, held out level from the pivot
  const below = new Set<string>();
  for (const [pid, owner] of rig.ownerOf) if (rig.chain.get(owner)?.has(j.id)) below.add(pid);
  let moment = 0;
  let grams = 0;
  for (const id of below) {
    const m = masses.get(id);
    if (!m) continue;
    grams += m.grams;
    moment += (m.grams / 1000) * 9.81 * (Math.hypot(m.centroid[0] - j.origin[0], m.centroid[1] - j.origin[1], m.centroid[2] - j.origin[2]) / 1000);
  }
  if (j.type === 'prismatic') return { effort: Math.max(5, (grams / 1000) * 9.81 * 3), source: 'estimate' };
  return { effort: Math.max(0.3, moment * 3), source: 'estimate' };
}
