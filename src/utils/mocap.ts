import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import type { AnimationKeyframe, JointValues, RobotAnimation, RobotJoint } from '../types/robotics';
import { forwardKinematics, isMovable, linkParts, nameWords, preBend, sideOf, solveIK, type IkTarget, type Rig, type V3 } from './kinematics';
import type { PointOf } from './animation';

/**
 * Motion capture (BVH) onto a robot. The human and the robot rarely share proportions or rest
 * poses (a T-pose vs arms down), so motion is moved by direction, not by joint angle: every
 * frame, each robot limb segment is pointed the way the matching human segment points, at the
 * robot's own segment length, and IK finds the joint values. The body moves by the human's hips,
 * scaled by leg length.
 */

/** Body landmarks shared by people and robots */
export const KEYPOINTS = [
  'hips', 'chest', 'neck', 'head',
  'leftShoulder', 'leftElbow', 'leftWrist',
  'rightShoulder', 'rightElbow', 'rightWrist',
  'leftHip', 'leftKnee', 'leftAnkle', 'leftToe',
  'rightHip', 'rightKnee', 'rightAnkle', 'rightToe',
] as const;
export type Keypoint = (typeof KEYPOINTS)[number];

export const KEYPOINT_LABELS: Record<Keypoint, string> = {
  hips: 'Hips', chest: 'Chest', neck: 'Neck', head: 'Head',
  leftShoulder: 'Left shoulder', leftElbow: 'Left elbow', leftWrist: 'Left wrist',
  rightShoulder: 'Right shoulder', rightElbow: 'Right elbow', rightWrist: 'Right wrist',
  leftHip: 'Left hip', leftKnee: 'Left knee', leftAnkle: 'Left ankle', leftToe: 'Left toe',
  rightHip: 'Right hip', rightKnee: 'Right knee', rightAnkle: 'Right ankle', rightToe: 'Right toe',
};

/* ------------------------------------------------------------------ */
/* BVH                                                                 */
/* ------------------------------------------------------------------ */

export interface Mocap {
  name: string;
  frameTime: number;
  frames: number;
  duration: number;
  bones: string[];
  /** World positions of every bone's joint at time t (BVH units, Y up) */
  sample: (t: number) => Map<string, THREE.Vector3>;
  /** Root bone orientation at time t */
  rootQuaternion: (t: number) => THREE.Quaternion;
  /** Bind pose (all rotations zero) */
  rest: Map<string, THREE.Vector3>;
  root: string;
  parentOf: Map<string, string | null>;
}

export function parseBvh(text: string, name = 'Motion'): Mocap {
  const loader = new BVHLoader();
  const { skeleton, clip } = loader.parse(text);
  const bones = skeleton.bones.filter((b) => b.name !== 'ENDSITE');
  const root = skeleton.bones[0];
  const parentOf = new Map<string, string | null>();
  for (const b of bones) parentOf.set(b.name, b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : null);
  const collect = () => {
    root.updateMatrixWorld(true);
    return new Map(bones.map((b) => [b.name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld)]));
  };
  const rest = collect();
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const frameTime = (() => {
    const m = /Frame Time:\s*([\d.eE+-]+)/.exec(text);
    return m ? Number(m[1]) : 1 / 30;
  })();
  const frames = Number(/Frames:\s*(\d+)/.exec(text)?.[1] ?? 0);
  const setTime = (t: number) => {
    mixer.setTime(Math.min(Math.max(t, 0), clip.duration));
    root.updateMatrixWorld(true);
  };
  return {
    name,
    frameTime,
    frames,
    duration: clip.duration,
    bones: bones.map((b) => b.name),
    sample: (t) => {
      setTime(t);
      return collect();
    },
    rootQuaternion: (t) => {
      setTime(t);
      return root.getWorldQuaternion(new THREE.Quaternion());
    },
    rest,
    root: root.name,
    parentOf,
  };
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

/** A name's segment words with the side and filler removed: "mixamorig:LeftUpLeg" → "up leg" */
function segment(name: string): string {
  const words = nameWords(name).filter((w) => !['left', 'right', 'l', 'r', 'joint', 'jnt', 'bone', 'link', 'bip01', 'bip001'].includes(w));
  if (words.length && /^[lr][a-z]{3,}$/.test(words[0]) && sideOf(name)) words[0] = words[0].slice(1);
  return words
    .map((w) => w.replace(/^left|^right|left$|right$/g, ''))
    .filter(Boolean)
    .join(' ');
}

/** Human bone names per landmark, most specific first */
const HUMAN_NAMES: Partial<Record<string, string[]>> = {
  Shoulder: ['upper arm', 'upperarm', 'arm', 'shldr', 'shoulder'],
  Elbow: ['fore arm', 'forearm', 'lower arm', 'lowerarm', 'elbow'],
  Wrist: ['hand', 'wrist'],
  Hip: ['up leg', 'upleg', 'upper leg', 'upperleg', 'thigh', 'hip'],
  Knee: ['leg', 'lower leg', 'lowerleg', 'shin', 'knee', 'calf'],
  Ankle: ['foot', 'ankle'],
  Toe: ['toe base', 'toebase', 'toe', 'toes', 'ball'],
};

const compact = (s: string) => s.replace(/\s+/g, '');

/** Bones for each landmark, by name, then the chest where the arms branch */
export function autoMapBones(m: Mocap): Partial<Record<Keypoint, string>> {
  const out: Partial<Record<Keypoint, string>> = {};
  const find = (side: 'left' | 'right', kind: string) => {
    for (const want of HUMAN_NAMES[kind] ?? []) {
      const hit = m.bones.find((b) => sideOf(b) === side && (segment(b) === want || compact(segment(b)) === compact(want)));
      if (hit) return hit;
    }
    return undefined;
  };
  for (const side of ['left', 'right'] as const) {
    for (const kind of ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle', 'Toe']) {
      const b = find(side, kind);
      if (b) out[`${side}${kind}` as Keypoint] = b;
    }
  }
  out.hips = m.bones.find((b) => /^(hips?|pelvis|root)$/.test(segment(b))) ?? m.root;
  out.neck = m.bones.find((b) => /^neck( ?1)?$/.test(segment(b)));
  out.head = m.bones.find((b) => /^head$/.test(segment(b)));
  // Chest: the spine bone both arms hang from
  const ancestors = (b?: string) => {
    const list: string[] = [];
    for (let at = b ? m.parentOf.get(b) : null; at; at = m.parentOf.get(at) ?? null) list.push(at);
    return list;
  };
  const l = ancestors(out.leftShoulder), r = new Set(ancestors(out.rightShoulder));
  out.chest = l.find((b) => r.has(b) && b !== out.hips) ?? m.bones.find((b) => /^(chest|spine ?2|spine ?1)$/.test(segment(b)));
  return out;
}

/** Which robot joints sit at each landmark */
function robotKind(name: string): string | null {
  const n = name.toLowerCase();
  if (/shoulder/.test(n)) return 'Shoulder';
  if (/elbow/.test(n)) return 'Elbow';
  if (/wrist|hand/.test(n)) return 'Wrist';
  if (/hip|haa|hfe|thigh/.test(n)) return 'Hip';
  if (/knee|kfe|calf|shin/.test(n)) return 'Knee';
  if (/ankle|ffe|faa|foot/.test(n)) return 'Ankle';
  return null;
}

/** Robot joints per landmark: the first joint of that kind on each side (shoulder pitch before roll) */
export function autoMapRobot(rig: Rig): Partial<Record<Keypoint, string>> {
  const out: Partial<Record<Keypoint, string>> = {};
  const movable = rig.joints.filter(isMovable);
  for (const j of movable) {
    const kind = robotKind(j.name) ?? robotKind(j.id);
    const side = sideOf(j.name) ?? sideOf(j.id);
    if (!kind || !side) continue;
    const key = `${side}${kind}` as Keypoint;
    const cur = out[key] ? rig.byId.get(out[key]!) : undefined;
    if (!cur || (rig.depth.get(j.id) ?? 0) < (rig.depth.get(cur.id) ?? 0)) out[key] = j.id;
  }
  const first = (re: RegExp) =>
    movable.filter((j) => re.test(j.name.toLowerCase())).sort((a, b) => (rig.depth.get(a.id) ?? 0) - (rig.depth.get(b.id) ?? 0))[0]?.id;
  out.neck = first(/neck|head/);
  out.chest = first(/waist|torso|spine|trunk|chest/);
  return out;
}

/* ------------------------------------------------------------------ */
/* Retargeting                                                         */
/* ------------------------------------------------------------------ */

export interface RetargetOptions {
  /** Landmark → BVH bone, and landmark → robot joint (auto-mapped when left out) */
  bones?: Partial<Record<Keypoint, string>>;
  joints?: Partial<Record<Keypoint, string>>;
  fps?: number;
  start?: number;
  end?: number;
  /** Keep the body over the origin (treadmill); height and turning still follow the hips */
  inPlace?: boolean;
  loop?: boolean;
  name?: string;
}

export interface RetargetResult {
  animation: RobotAnimation;
  /** Mean miss per landmark (mm) */
  error: Partial<Record<Keypoint, number>>;
  /** Landmarks matched on both sides */
  mapped: Array<{ keypoint: Keypoint; bone: string; joint: string }>;
  notes: string[];
}

const LIMBS: Array<{ chain: Keypoint[]; weight: number[] }> = [
  { chain: ['leftHip', 'leftKnee', 'leftAnkle', 'leftToe'], weight: [0, 1, 1.4, 0.5] },
  { chain: ['rightHip', 'rightKnee', 'rightAnkle', 'rightToe'], weight: [0, 1, 1.4, 0.5] },
  { chain: ['leftShoulder', 'leftElbow', 'leftWrist'], weight: [0, 1, 1.2] },
  { chain: ['rightShoulder', 'rightElbow', 'rightWrist'], weight: [0, 1, 1.2] },
];

export function retarget(m: Mocap, rig: Rig, pointOf: PointOf, opts: RetargetOptions = {}): RetargetResult | string {
  const notes: string[] = [];
  const bones = { ...autoMapBones(m), ...opts.bones };
  const joints = { ...autoMapRobot(rig), ...opts.joints };

  // Robot landmarks in the rest pose (scene mm)
  const rp = new Map<Keypoint, THREE.Vector3>();
  for (const k of KEYPOINTS) {
    const id = joints[k];
    const j = id ? rig.byId.get(id) : undefined;
    if (j) rp.set(k, new THREE.Vector3(...j.origin));
  }
  // Ends of limbs that have no joint there: the last link's far point
  const endOf = (side: 'left' | 'right', kind: 'Wrist' | 'Toe', from: Keypoint) => {
    const key = `${side}${kind}` as Keypoint;
    if (rp.has(key) && kind !== 'Toe') return;
    const base = joints[from];
    if (!base) return;
    // The deepest joint under the landmark on that side
    const below = rig.joints.filter((j) => isMovable(j) && rig.chain.get(j.id)?.has(base));
    const last = below.sort((a, b) => (rig.depth.get(b.id) ?? 0) - (rig.depth.get(a.id) ?? 0))[0];
    if (!last) return;
    if (kind === 'Toe') {
      const sole = pointOf(last.id, 'bottom');
      const ids = linkParts(rig, last.id);
      if (!sole || !ids.length) return;
      // The toe sits forward of the ankle along the foot (front is +Z)
      const c = pointOf(last.id, 'center')!;
      const len = Math.max(30, Math.abs(c[2] - (rp.get(from)?.z ?? c[2])) * 2 + 40);
      rp.set(key, new THREE.Vector3(sole[0], sole[1], sole[2] + len * 0.5));
    } else {
      const c = pointOf(last.id, 'center');
      if (c) rp.set(key, new THREE.Vector3(...c));
    }
  };
  endOf('left', 'Wrist', 'leftElbow');
  endOf('right', 'Wrist', 'rightElbow');
  endOf('left', 'Toe', 'leftAnkle');
  endOf('right', 'Toe', 'rightAnkle');
  // Hips between the hip joints; chest between the shoulders; head at the head's center
  if (rp.has('leftHip') && rp.has('rightHip')) rp.set('hips', rp.get('leftHip')!.clone().add(rp.get('rightHip')!).multiplyScalar(0.5));
  else rp.set('hips', new THREE.Vector3(...rig.rootPivot));
  if (rp.has('leftShoulder') && rp.has('rightShoulder')) rp.set('chest', rp.get('leftShoulder')!.clone().add(rp.get('rightShoulder')!).multiplyScalar(0.5));
  const torsoJoints = rig.joints.filter((j) => isMovable(j) && /waist|torso|spine|trunk|chest/.test(j.name.toLowerCase())).map((j) => j.id);
  const neckJoints = rig.joints.filter((j) => isMovable(j) && /neck|head/.test(j.name.toLowerCase())).map((j) => j.id);
  const deepest = (ids: string[]) => [...ids].sort((a, b) => (rig.depth.get(b) ?? 0) - (rig.depth.get(a) ?? 0))[0];
  if (neckJoints.length) {
    const c = pointOf(deepest(neckJoints), 'center');
    if (c) rp.set('head', new THREE.Vector3(...c));
  } else {
    rp.delete('neck');
    rp.delete('head');
  }

  const mapped = KEYPOINTS.filter((k) => bones[k] && rp.has(k)).map((k) => ({ keypoint: k, bone: bones[k]!, joint: joints[k] ?? (k === 'hips' ? 'the body' : 'the end of the limb') }));
  if (mapped.filter((x) => /Knee|Ankle|Elbow|Wrist/.test(x.keypoint)).length < 2) {
    return 'Couldn’t match the robot’s limbs to the motion. Name the joints left_knee, right_elbow… or map them by hand.';
  }

  // Human facing: turn so the performer faces the robot's front (+Z), left toward +X
  const up = new THREE.Vector3(0, 1, 0);
  const H = (pos: Map<string, THREE.Vector3>, k: Keypoint) => (bones[k] ? pos.get(bones[k]!) : undefined);
  const rl = H(m.rest, 'leftHip') ?? H(m.rest, 'leftShoulder');
  const rr = H(m.rest, 'rightHip') ?? H(m.rest, 'rightShoulder');
  const face = new THREE.Quaternion();
  if (rl && rr) {
    const left = rl.clone().sub(rr).setY(0).normalize();
    const fwd = left.clone().cross(up).normalize();
    face.setFromUnitVectors(fwd, new THREE.Vector3(0, 0, 1));
  }
  const faceInv = face.clone().invert();

  // Scale: robot leg (hip → ankle) over the performer's, measured in the bind pose
  const legLen = (pos: (k: Keypoint) => THREE.Vector3 | undefined) => {
    const a = pos('leftHip'), b = pos('leftKnee'), c = pos('leftAnkle');
    return a && b && c ? a.distanceTo(b) + b.distanceTo(c) : null;
  };
  const humanLeg = legLen((k) => H(m.rest, k));
  const robotLeg = legLen((k) => rp.get(k));
  const scale = humanLeg && robotLeg ? robotLeg / humanLeg : (rp.get('hips')!.y || 500) / Math.max(H(m.rest, 'hips')?.y ?? 1, 1e-3);
  if (!humanLeg || !robotLeg) notes.push('No legs on one side: the body moves by height ratio');

  // Robot segment lengths
  const seg = (a: Keypoint, b: Keypoint) => (rp.has(a) && rp.has(b) ? rp.get(a)!.distanceTo(rp.get(b)!) : 0);

  const fps = Math.min(Math.max(opts.fps ?? 30, 5), 60);
  const t0 = Math.max(0, opts.start ?? 0);
  const t1 = Math.min(m.duration, opts.end ?? m.duration);
  const n = Math.max(2, Math.floor((t1 - t0) * fps) + 1);
  const hips0 = H(m.sample(t0), 'hips')!.clone();
  const hipsRest = H(m.rest, 'hips')!;

  // Which robot part carries each landmark (the one its targets pull on)
  const carrier = (k: Keypoint): { partId: string; point: V3 } | null => {
    const p = rp.get(k);
    if (!p) return null;
    let jointId = joints[k];
    if (k === 'chest') jointId = torsoJoints.length ? deepest(torsoJoints) : undefined;
    else if (k === 'head' || k === 'neck') jointId = neckJoints.length ? deepest(neckJoints) : undefined;
    else if (k === 'hips') jointId = undefined;
    else if (/Toe/.test(k)) {
      const ankle = joints[k.replace('Toe', 'Ankle') as Keypoint];
      const below = rig.joints.filter((j) => isMovable(j) && ankle && rig.chain.get(j.id)?.has(ankle));
      jointId = below.sort((a, b) => (rig.depth.get(b.id) ?? 0) - (rig.depth.get(a.id) ?? 0))[0]?.id;
    } else if (/Wrist/.test(k) && !joints[k]) {
      const elbow = joints[k.replace('Wrist', 'Elbow') as Keypoint];
      const below = rig.joints.filter((j) => isMovable(j) && elbow && rig.chain.get(j.id)?.has(elbow));
      jointId = below.sort((a, b) => (rig.depth.get(b.id) ?? 0) - (rig.depth.get(a.id) ?? 0))[0]?.id;
    } else if (jointId) {
      // A joint's origin moves with the link above it: pull on the parent joint's link
      jointId = rig.parentOf.get(jointId) ?? undefined;
    }
    const partId = jointId ? linkParts(rig, jointId)[0] : undefined;
    return partId ? { partId, point: [p.x, p.y, p.z] } : null;
  };

  let values: JointValues = preBend(rig, {}, rig.joints.map((j) => j.id));
  const keyframes: AnimationKeyframe[] = [];
  const errSum: Partial<Record<Keypoint, number>> = {};
  const human = new Map<Keypoint, THREE.Vector3>();
  const humanLow: number[] = [];

  for (let f = 0; f < n; f++) {
    const t = t0 + (f / (n - 1)) * (t1 - t0);
    const pos = m.sample(t);
    human.clear();
    for (const k of KEYPOINTS) {
      const p = H(pos, k);
      if (p) human.set(k, p.clone().sub(hipsRest).applyQuaternion(face));
    }
    // Body: the hips' travel and turn
    const hipNow = H(pos, 'hips')!;
    // Height relative to the first frame (the bind pose's root often sits at 0)
    const travel = hipNow.clone().sub(opts.inPlace ? new THREE.Vector3(hipNow.x, hips0.y, hipNow.z) : hips0).applyQuaternion(face).multiplyScalar(scale);
    const ankles = (['leftAnkle', 'rightAnkle'] as Keypoint[]).map((k) => H(pos, k)?.y).filter((v): v is number => v !== undefined);
    humanLow.push(ankles.length ? Math.min(...ankles) : 0);
    const q = face.clone().multiply(m.rootQuaternion(t)).multiply(faceInv);
    const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const root = {
      position: [travel.x, travel.y, travel.z].map((v) => Math.round(v * 10) / 10) as V3,
      rotation: [euler.x, euler.y, euler.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10) as V3,
    };
    const posedLandmark = (k: Keypoint) => {
      const c = carrier(k);
      if (!c) return null;
      const posed = forwardKinematics(rig, { values, root });
      const owner = rig.ownerOf.get(c.partId);
      const mat = (owner && posed.joint.get(owner)) || posed.root;
      return new THREE.Vector3(...c.point).applyMatrix4(mat);
    };
    const dir = (a: Keypoint, b: Keypoint) => {
      const pa = human.get(a), pb = human.get(b);
      return pa && pb ? pb.clone().sub(pa).normalize() : null;
    };

    // 1. Torso and head, from the hips
    const torsoTargets: IkTarget[] = [];
    const hipsPosed = rp.get('hips')!.clone().applyMatrix4(forwardKinematics(rig, { values: {}, root }).root);
    for (const [a, b, w, js] of [['hips', 'chest', 0.6, torsoJoints], ['chest', 'head', 0.3, neckJoints]] as const) {
      if (!js.length) continue;
      const d = dir(a, b);
      const c = carrier(b);
      if (!d || !c) continue;
      const from = a === 'hips' ? hipsPosed : posedLandmark(a);
      if (!from) continue;
      const target = from.clone().addScaledVector(d, seg(a, b));
      torsoTargets.push({ partId: c.partId, point: c.point, target: [target.x, target.y, target.z], weight: w });
    }
    if (torsoTargets.length) values = solveIK(rig, values, torsoTargets, { joints: [...torsoJoints, ...neckJoints], root, prefer: values, preferWeight: 0.05, iterations: 25, stiffTorso: false }).values;

    // 2. Limbs, out from where the shoulders and hips are now
    const targets: IkTarget[] = [];
    const tagged: Keypoint[] = [];
    for (const limb of LIMBS) {
      const start = posedLandmark(limb.chain[0]) ?? (rp.get(limb.chain[0]) ? rp.get(limb.chain[0])!.clone().applyMatrix4(forwardKinematics(rig, { values, root }).root) : null);
      if (!start) continue;
      let from = start;
      for (let i = 1; i < limb.chain.length; i++) {
        const a = limb.chain[i - 1], b = limb.chain[i];
        const d = dir(a, b);
        const c = carrier(b);
        const len = seg(a, b);
        if (!d || !c || !len) break;
        const target = from.clone().addScaledVector(d, len);
        targets.push({ partId: c.partId, point: c.point, target: [target.x, target.y, target.z], weight: limb.weight[i] });
        tagged.push(b);
        from = target;
      }
    }
    const limbJoints = rig.joints.filter((j) => isMovable(j) && !torsoJoints.includes(j.id) && !neckJoints.includes(j.id)).map((j) => j.id);
    const res = solveIK(rig, values, targets, { joints: limbJoints, root, prefer: values, preferWeight: 0.03, iterations: f === 0 ? 80 : 25 });
    values = res.values;
    tagged.forEach((k, i) => (errSum[k] = (errSum[k] ?? 0) + (res.errors[i] ?? 0)));

    keyframes.push({
      t: Math.round((f / fps) * 1000) / 1000,
      values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 100) / 100])),
      root,
    });
  }

  // Feet on the floor: lift any frame whose lowest sole dips below it, and settle frames where
  // the performer stands
  const soles = (['leftAnkle', 'rightAnkle'] as Keypoint[])
    .map((k) => {
      const ankle = joints[k];
      const below = rig.joints.filter((j) => isMovable(j) && ankle && rig.chain.get(j.id)?.has(ankle));
      const last = below.sort((a, b) => (rig.depth.get(b.id) ?? 0) - (rig.depth.get(a.id) ?? 0))[0];
      const p = last ? pointOf(last.id, 'bottom') : null;
      const part = last ? linkParts(rig, last.id)[0] : undefined;
      return p && part ? { part, p } : null;
    })
    .filter((x): x is { part: string; p: V3 } => !!x);
  if (soles.length) {
    // The performer is standing when an ankle is within 4% of leg length of its lowest point
    const ground = Math.min(...humanLow);
    const near = (humanLeg ?? 100) * 0.04;
    keyframes.forEach((k, i) => {
      const posed = forwardKinematics(rig, k);
      const low = Math.min(
        ...soles.map((s) => new THREE.Vector3(...s.p).applyMatrix4(posed.joint.get(rig.ownerOf.get(s.part)!) ?? posed.root).y)
      );
      if (low < 0 || humanLow[i] - ground < near) k.root!.position![1] = Math.round((k.root!.position![1] - low) * 10) / 10;
    });
  }

  const error: Partial<Record<Keypoint, number>> = {};
  for (const [k, v] of Object.entries(errSum)) error[k as Keypoint] = Math.round((v! / n) * 10) / 10;
  const unmapped = KEYPOINTS.filter((k) => /Knee|Ankle|Elbow|Wrist/.test(k) && !mapped.some((x) => x.keypoint === k));
  if (unmapped.length) notes.push(`Not matched: ${unmapped.map((k) => KEYPOINT_LABELS[k]).join(', ')}`);
  const name = opts.name ?? m.name;
  return {
    animation: {
      id: '',
      name,
      duration: Math.round((t1 - t0) * 1000) / 1000,
      loop: opts.loop ?? false,
      keyframes,
      interpolation: 'linear',
      source: 'mocap',
    },
    error,
    mapped,
    notes,
  };
}

/** Joints a mapping left without motion, for the summary */
export function unmappedJoints(rig: Rig, anim: RobotAnimation): RobotJoint[] {
  const moved = new Set<string>();
  const first = anim.keyframes[0]?.values ?? {};
  for (const k of anim.keyframes) for (const [id, v] of Object.entries(k.values)) if (Math.abs(v - (first[id] ?? 0)) > 0.5) moved.add(id);
  return rig.joints.filter((j) => isMovable(j) && !moved.has(j.id));
}
