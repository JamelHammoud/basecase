import * as THREE from 'three';
import type { JointValues, RobotJoint, RobotPoseState, RootOffset, ScenePart } from '../types/robotics';

/**
 * The robot as a kinematic tree, built from the declared joints. Everything is expressed in
 * the scene frame of the modeled (rest) pose: a joint turns its child link about its rest axis
 * through its rest origin, composed from the base outward, so posing never edits the parts.
 */

export type V3 = [number, number, number];

export interface Rig {
  /** Root to leaf */
  joints: RobotJoint[];
  byId: Map<string, RobotJoint>;
  parentOf: Map<string, string | null>;
  depth: Map<string, number>;
  /** The deepest joint that moves each part directly */
  ownerOf: Map<string, string>;
  /** Joint and every joint above it, by joint id */
  chain: Map<string, Set<string>>;
  /** Parts the whole-robot offset moves (everything but reference photos) */
  bodyParts: Set<string>;
  /** Where whole-robot rotations turn about: the base joints' centroid */
  rootPivot: V3;
}

export const isMovable = (j: RobotJoint) => j.type === 'revolute' || j.type === 'prismatic';

/** A part's placement (rest pose): position and XYZ rotation, no scale */
export function partMatrix(p: ScenePart): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation.map(THREE.MathUtils.degToRad) as V3), 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...p.position), q, new THREE.Vector3(1, 1, 1));
}

/** Stores a joint's pivot in its mount's frame (its first parent part, else its first child part) */
export function anchorJoint(j: RobotJoint, parts: ScenePart[]): RobotJoint {
  const id = j.parent.find((x) => parts.some((p) => p.id === x)) ?? j.child.find((x) => parts.some((p) => p.id === x));
  const part = id ? parts.find((p) => p.id === id) : undefined;
  if (!part) return { ...j, frame: undefined };
  const inv = partMatrix(part).invert();
  const o = new THREE.Vector3(...j.origin).applyMatrix4(inv);
  const a = new THREE.Vector3(...j.axis).transformDirection(inv);
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return { ...j, frame: { part: part.id, origin: [r(o.x), r(o.y), r(o.z)], axis: [r(a.x), r(a.y), r(a.z)] } };
}

/** Joints with their pivot and axis read from the part they're mounted on */
export function resolveJoints(joints: RobotJoint[], parts: ScenePart[]): RobotJoint[] {
  if (!joints.some((j) => j.frame)) return joints;
  const byId = new Map(parts.map((p) => [p.id, p]));
  return joints.map((j) => {
    const part = j.frame && byId.get(j.frame.part);
    if (!part) return j;
    const m = partMatrix(part);
    const o = new THREE.Vector3(...j.frame!.origin).applyMatrix4(m);
    const a = new THREE.Vector3(...j.frame!.axis).transformDirection(m);
    return { ...j, origin: [o.x, o.y, o.z], axis: [a.x, a.y, a.z] };
  });
}

export function buildRig(joints: RobotJoint[], parts: ScenePart[]): Rig {
  const byId = new Map(joints.map((j) => [j.id, j]));
  const childOf = new Map<string, RobotJoint[]>();
  for (const j of joints) for (const id of j.child) childOf.set(id, [...(childOf.get(id) ?? []), j]);

  const parentOf = new Map<string, string | null>();
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (j: RobotJoint): number => {
    if (depth.has(j.id)) return depth.get(j.id)!;
    if (visiting.has(j.id)) return 0;
    visiting.add(j.id);
    let parent: RobotJoint | null = null;
    const explicit = j.parentJoint ? byId.get(j.parentJoint) : undefined;
    if (explicit && explicit !== j) parent = explicit;
    else {
      // The joint whose moving side holds this joint's mount; the deepest when several list it
      let best = -1;
      for (const id of j.parent) {
        for (const k of childOf.get(id) ?? []) {
          if (k === j || visiting.has(k.id)) continue;
          const d = depthOf(k);
          if (d > best) {
            best = d;
            parent = k;
          }
        }
      }
    }
    const d = parent ? depthOf(parent) + 1 : 0;
    visiting.delete(j.id);
    parentOf.set(j.id, parent?.id ?? null);
    depth.set(j.id, d);
    return d;
  };
  joints.forEach(depthOf);

  const ownerOf = new Map<string, string>();
  for (const [partId, list] of childOf) {
    const deepest = list.reduce((a, b) => ((depth.get(b.id) ?? 0) > (depth.get(a.id) ?? 0) ? b : a));
    ownerOf.set(partId, deepest.id);
  }
  // A joint's mount moves with the joint above it (the base when there is none)
  const mounts = new Set<string>();
  for (const j of joints) {
    const above = parentOf.get(j.id);
    for (const id of j.parent) {
      if (ownerOf.has(id) || mounts.has(id)) continue;
      mounts.add(id);
      if (above) ownerOf.set(id, above);
    }
  }
  // Unlisted parts follow their group (screws and caps grouped with a link), but only when the
  // whole group moves with one joint: a group spanning several links (a whole robot) says nothing
  for (const p of parts) {
    if (ownerOf.has(p.id) || mounts.has(p.id) || !p.group) continue;
    const owners = new Set(parts.filter((q) => q.group?.id === p.group!.id && q.id !== p.id && (ownerOf.has(q.id) || mounts.has(q.id))).map((q) => ownerOf.get(q.id) ?? 'base'));
    if (owners.size === 1) {
      const only = [...owners][0];
      if (only !== 'base') ownerOf.set(p.id, only);
    }
  }

  const chain = new Map<string, Set<string>>();
  for (const j of joints) {
    const set = new Set<string>();
    let at: string | null = j.id;
    while (at && !set.has(at)) {
      set.add(at);
      at = parentOf.get(at) ?? null;
    }
    chain.set(j.id, set);
  }

  const ordered = [...joints].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  const roots = ordered.filter((j) => !parentOf.get(j.id));
  const rootPivot: V3 = roots.length
    ? [0, 1, 2].map((i) => roots.reduce((s, j) => s + j.origin[i], 0) / roots.length) as V3
    : [0, 0, 0];

  return {
    joints: ordered,
    byId,
    parentOf,
    depth,
    ownerOf,
    chain,
    bodyParts: new Set(parts.filter((p) => p.role !== 'reference').map((p) => p.id)),
    rootPivot,
  };
}

export function clampJoint(j: RobotJoint, v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (!j.range) return v;
  return Math.min(Math.max(v, Math.min(j.range[0], j.range[1])), Math.max(j.range[0], j.range[1]));
}

/** Unit of a joint's value */
export const jointUnit = (j: RobotJoint) => (j.type === 'prismatic' ? 'mm' : '°');

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Motion of one joint alone, in the rest frame */
export function jointMotion(j: RobotJoint, value: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  if (!isMovable(j) || !value) return out.identity();
  _v.set(j.axis[0], j.axis[1], j.axis[2]).normalize();
  if (j.type === 'prismatic') return out.makeTranslation(_v.x * value, _v.y * value, _v.z * value);
  _o.set(j.origin[0], j.origin[1], j.origin[2]);
  _q.setFromAxisAngle(_v, THREE.MathUtils.degToRad(value));
  // T(o) · R · T(−o)
  out.makeRotationFromQuaternion(_q);
  const r = _o.clone().applyQuaternion(_q);
  out.setPosition(_o.x - r.x, _o.y - r.y, _o.z - r.z);
  return out;
}

export function rootMatrix(rig: Rig, root?: RootOffset): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (!root) return m;
  const [px, py, pz] = rig.rootPivot;
  const r = root.rotation ?? [0, 0, 0];
  if (r[0] || r[1] || r[2]) {
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r.map(THREE.MathUtils.degToRad) as V3, 'XYZ'));
    m.makeTranslation(px, py, pz).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-px, -py, -pz));
  }
  const t = root.position ?? [0, 0, 0];
  if (t[0] || t[1] || t[2]) m.premultiply(new THREE.Matrix4().makeTranslation(t[0], t[1], t[2]));
  return m;
}

export interface PosedRig {
  /** World motion of each joint's moving side (rest → posed) */
  joint: Map<string, THREE.Matrix4>;
  root: THREE.Matrix4;
}

export function forwardKinematics(rig: Rig, pose: RobotPoseState | null | undefined): PosedRig {
  const root = rootMatrix(rig, pose?.root);
  const joint = new Map<string, THREE.Matrix4>();
  const tmp = new THREE.Matrix4();
  for (const j of rig.joints) {
    const parent = rig.parentOf.get(j.id);
    const base = (parent && joint.get(parent)) || root;
    const v = clampJoint(j, pose?.values[j.id] ?? 0);
    joint.set(j.id, base.clone().multiply(jointMotion(j, v, tmp)));
  }
  return { joint, root };
}

/** Rest → posed motion of a part, or null when it doesn't move */
export function partMotion(rig: Rig, posed: PosedRig, partId: string): THREE.Matrix4 | null {
  const owner = rig.ownerOf.get(partId);
  if (owner) return posed.joint.get(owner) ?? null;
  return rig.bodyParts.has(partId) ? posed.root : null;
}

/** Every moved part's motion; parts that stay put are left out */
export function poseDeltas(rig: Rig, pose: RobotPoseState | null | undefined, partIds: string[]): Map<string, THREE.Matrix4> {
  const out = new Map<string, THREE.Matrix4>();
  if (!pose || (isRestPose(pose) && !rig.joints.length)) return out;
  const posed = forwardKinematics(rig, pose);
  for (const id of partIds) {
    const m = partMotion(rig, posed, id);
    if (m && !isIdentity(m)) out.set(id, m);
  }
  return out;
}

export function isRestPose(pose: RobotPoseState | null | undefined): boolean {
  if (!pose) return true;
  const r = pose.root;
  if (r && [...(r.position ?? []), ...(r.rotation ?? [])].some((v) => Math.abs(v) > 1e-6)) return false;
  return Object.values(pose.values).every((v) => Math.abs(v) < 1e-6);
}

function isIdentity(m: THREE.Matrix4) {
  const e = m.elements;
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return e.every((v, i) => Math.abs(v - id[i]) < 1e-9);
}

/** A joint's pivot and axis in the posed frame */
export function posedAxis(rig: Rig, posed: PosedRig, j: RobotJoint): { origin: THREE.Vector3; axis: THREE.Vector3 } {
  const parent = rig.parentOf.get(j.id);
  const base = (parent && posed.joint.get(parent)) || posed.root;
  const origin = new THREE.Vector3(...j.origin).applyMatrix4(base);
  const axis = new THREE.Vector3(...j.axis).transformDirection(base);
  return { origin, axis };
}

/** Parts a joint moves directly (its link) */
export function linkParts(rig: Rig, jointId: string): string[] {
  return [...rig.ownerOf].filter(([, j]) => j === jointId).map(([p]) => p);
}

/* ------------------------------------------------------------------ */
/* Inverse kinematics: damped least squares over the joint values      */
/* ------------------------------------------------------------------ */

export interface IkTarget {
  partId: string;
  /** A point on the part in the rest pose (scene mm) */
  point: V3;
  /** Where it should go (scene mm) */
  target: V3;
  weight?: number;
}

export interface IkOptions {
  /** Joints the solver may move; defaults to every movable joint above the targets */
  joints?: string[];
  root?: RootOffset;
  iterations?: number;
  /** Stop below this error (mm) */
  tolerance?: number;
  /** Pull toward these values (keeps the solution near the previous frame) */
  prefer?: JointValues;
  preferWeight?: number;
  /** Hold the waist and spine back so limbs reach first (default true) */
  stiffTorso?: boolean;
}

export interface IkResult {
  values: JointValues;
  /** Remaining distance per target (mm) */
  errors: number[];
  maxError: number;
}

export function solveIK(rig: Rig, start: JointValues, targets: IkTarget[], opts: IkOptions = {}): IkResult {
  const values: JointValues = { ...start };
  const owners = targets.map((t) => rig.ownerOf.get(t.partId) ?? null);
  const allowed = opts.joints ? new Set(opts.joints) : null;
  const vars = rig.joints.filter(
    (j) => isMovable(j) && (!allowed || allowed.has(j.id)) && owners.some((o) => o && rig.chain.get(o)?.has(j.id))
  );
  const pose = (): RobotPoseState => ({ values, root: opts.root });
  const evalErrors = (posed: PosedRig) =>
    targets.map((t, i) => {
      const m = owners[i] ? posed.joint.get(owners[i]!) : posed.root;
      const p = new THREE.Vector3(...t.point).applyMatrix4(m ?? posed.root);
      return { p, r: new THREE.Vector3(...t.target).sub(p) };
    });

  const n = vars.length;
  const mu = opts.preferWeight ?? 0.02;
  const iterations = opts.iterations ?? 40;
  const tol = opts.tolerance ?? 0.3;
  const DEG = Math.PI / 180;
  let posed = forwardKinematics(rig, pose());
  let cur = evalErrors(posed);
  // The body is stiffer than the limbs: reach with the arm before bending the torso
  const stiff = vars.map((j) => (opts.stiffTorso !== false && (j.limb === 'torso' || /waist|torso|spine|trunk|chest/i.test(j.name)) ? 2000 : 1));
  const cost = (c: typeof cur, v: JointValues) =>
    c.reduce((s, e, i) => s + (targets[i].weight ?? 1) * e.r.lengthSq(), 0) +
    mu * vars.reduce((s, j, a) => {
      const pref = opts.prefer?.[j.id];
      return pref === undefined ? s : s + stiff[a] * (pref - (v[j.id] ?? 0)) ** 2;
    }, 0);
  let curCost = cost(cur, values);
  // Levenberg–Marquardt: damping grows after a bad step and shrinks after a good one
  let lambda = 1;

  for (let it = 0; it < iterations && n; it++) {
    if (Math.max(...cur.map((e) => e.r.length())) < tol) break;
    const axes = vars.map((j) => posedAxis(rig, posed, j));
    // Normal equations: (JᵀWJ + λ + μ) Δ = JᵀW r + μ (prefer − x)
    const JtJ = Array.from({ length: n }, () => new Float64Array(n));
    const g = new Float64Array(n);
    const col = new THREE.Vector3();
    const cols: THREE.Vector3[][] = targets.map(() => []);
    targets.forEach((_, i) => {
      const owner = owners[i];
      for (let a = 0; a < n; a++) {
        const j = vars[a];
        if (!owner || !rig.chain.get(owner)?.has(j.id)) {
          cols[i][a] = new THREE.Vector3();
          continue;
        }
        if (j.type === 'prismatic') col.copy(axes[a].axis);
        else col.copy(axes[a].axis).cross(cur[i].p.clone().sub(axes[a].origin)).multiplyScalar(DEG);
        cols[i][a] = col.clone();
      }
    });
    targets.forEach((t, i) => {
      const w = t.weight ?? 1;
      for (let a = 0; a < n; a++) {
        const ca = cols[i][a];
        g[a] += w * ca.dot(cur[i].r);
        for (let c = a; c < n; c++) JtJ[a][c] += w * ca.dot(cols[i][c]);
      }
    });
    for (let a = 0; a < n; a++) {
      for (let c = 0; c < a; c++) JtJ[a][c] = JtJ[c][a];
      const pref = opts.prefer?.[vars[a].id];
      if (pref !== undefined) g[a] += mu * stiff[a] * (pref - (values[vars[a].id] ?? 0));
    }
    let improved = false;
    for (let tries = 0; tries < 6 && !improved; tries++) {
      const A = JtJ.map((row, a) => {
        const r = Float64Array.from(row);
        r[a] += lambda * (1 + row[a]) + mu * stiff[a];
        return r;
      });
      const delta = solveLinear(A, g);
      if (!delta) {
        lambda *= 4;
        continue;
      }
      const maxStep = Math.max(...delta.map(Math.abs));
      const scale = maxStep > 15 ? 15 / maxStep : 1;
      const trial: JointValues = { ...values };
      vars.forEach((j, a) => (trial[j.id] = clampJoint(j, (values[j.id] ?? 0) + delta[a] * scale)));
      const tPosed = forwardKinematics(rig, { values: trial, root: opts.root });
      const tErr = evalErrors(tPosed);
      const tCost = cost(tErr, trial);
      if (tCost < curCost) {
        Object.assign(values, trial);
        posed = tPosed;
        cur = tErr;
        // Stalled: the last step barely helped
        const gain = curCost - tCost;
        curCost = tCost;
        lambda = Math.max(lambda * 0.3, 1e-4);
        improved = true;
        if (gain < 1e-6 * Math.max(curCost, 1)) it = iterations;
      } else lambda *= 4;
    }
    if (!improved) break;
  }
  const errors = evalErrors(posed).map((e) => e.r.length());
  return { values, errors, maxError: errors.length ? Math.max(...errors) : 0 };
}

/**
 * Knees and elbows that sit straight in the rest pose are singular for IK: from 0 the solver
 * can't tell which way to bend. Joints whose range opens mostly one way start a little bent
 * that way (only those at 0 among `ids`).
 */
export function preBend(rig: Rig, values: JointValues, ids: Iterable<string>, deg = 20): JointValues {
  const out = { ...values };
  for (const id of ids) {
    const j = rig.byId.get(id);
    if (!j || j.type !== 'revolute' || !j.range || Math.abs(out[id] ?? 0) > 1) continue;
    const [lo, hi] = [Math.min(...j.range), Math.max(...j.range)];
    if (lo >= -20 && hi >= 60) out[id] = Math.min(deg, hi);
    else if (hi <= 20 && lo <= -60) out[id] = Math.max(-deg, lo);
  }
  return out;
}

/** Gaussian elimination with partial pivoting; null when singular */
function solveLinear(A: Float64Array[], b: Float64Array): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/* ------------------------------------------------------------------ */
/* Naming: which joints are legs, arms, the neck…                      */
/* ------------------------------------------------------------------ */

export type Side = 'left' | 'right' | null;

/** Words of a name: "LeftUpLeg" → left up leg, "l_knee_joint" → l knee joint */
export const nameWords = (name: string) =>
  name
    .replace(/^[a-z0-9]+:/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const LEFT_TAGS = new Set(['l', 'll', 'la', 'fl', 'rl', 'hl', 'lf', 'lh']);
const RIGHT_TAGS = new Set(['r', 'lr', 'ra', 'fr', 'rr', 'hr', 'rf', 'rh']);
const SEGMENT = /^(hip|knee|ankle|foot|toe|shoulder|shldr|elbow|wrist|hand|arm|forearm|leg|upleg|thigh|shin|collar|clavicle|calf|finger|thumb|eye|ear|antenna)/;

/** left / right from a joint or bone name: "left_knee", "l_knee", "lThigh", "LL_KFE", "FL_hip", "knee.R" */
export function sideOf(name: string): Side {
  const w = nameWords(name);
  if (w.some((x) => x.startsWith('left') || x.endsWith('left'))) return 'left';
  if (w.some((x) => x.startsWith('right') || x.endsWith('right'))) return 'right';
  if (LEFT_TAGS.has(w[0]) || w[w.length - 1] === 'l') return 'left';
  if (RIGHT_TAGS.has(w[0]) || w[w.length - 1] === 'r') return 'right';
  // "lhip", "rshldr"
  if (/^l/.test(w[0] ?? '') && SEGMENT.test(w[0].slice(1))) return 'left';
  if (/^r/.test(w[0] ?? '') && SEGMENT.test(w[0].slice(1))) return 'right';
  return null;
}

/** Joints grouped for the Pose panel: by limb and side, in chain order */
export function jointGroups(rig: Rig): Array<{ label: string; joints: RobotJoint[] }> {
  const groups = new Map<string, RobotJoint[]>();
  const label = (j: RobotJoint) => {
    const n = j.name.toLowerCase();
    const side = sideOf(j.name);
    const limb =
      j.limb && j.limb !== 'other'
        ? j.limb
        : /hip|knee|ankle|leg|thigh|shin|foot|calf|toe|haa|hfe|kfe|ffe|faa/.test(n)
          ? 'leg'
          : /shoulder|elbow|wrist|arm|hand|finger|grip|thumb/.test(n)
            ? 'arm'
            : /neck|head|yaw_head|pan|tilt/.test(n)
              ? 'neck'
              : /waist|torso|spine|chest|hip_yaw_base|trunk/.test(n)
                ? 'torso'
                : 'other';
    const names: Record<string, string> = { leg: 'leg', arm: 'arm', neck: 'Head', torso: 'Torso', other: 'Other' };
    if ((limb === 'leg' || limb === 'arm') && side) return `${side === 'left' ? 'Left' : 'Right'} ${names[limb]}`;
    if (limb === 'leg') return 'Legs';
    if (limb === 'arm') return 'Arms';
    return names[limb];
  };
  for (const j of rig.joints) {
    if (!isMovable(j)) continue;
    const l = label(j);
    groups.set(l, [...(groups.get(l) ?? []), j]);
  }
  const order = ['Head', 'Torso', 'Left arm', 'Right arm', 'Arms', 'Left leg', 'Right leg', 'Legs', 'Other'];
  const rank = (l: string) => {
    const i = order.findIndex((o) => o.toLowerCase() === l.toLowerCase());
    return i < 0 ? order.length : i;
  };
  return [...groups]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([label, joints]) => ({ label, joints }));
}

/** Readable joint name: "left_knee_joint" → "Left knee" */
export function prettyJointName(name: string): string {
  const s = name
    .replace(/[_.-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bjoint\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
}
