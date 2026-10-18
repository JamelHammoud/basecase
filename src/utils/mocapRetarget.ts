import * as THREE from 'three';
import type { AnimationKeyframe, JointValues, RobotAnimation, RootOffset } from '../types/robotics';
import type { PointOf } from './animationGoals';
import { forwardKinematics, isMovable, preBend, solveIK, type IkTarget, type Rig, type V3 } from './kinematics';
import { autoMapBones, autoMapRobot, KEYPOINT_LABELS, KEYPOINTS, type Keypoint, type Mocap } from './mocapBones';
import { carrierOf, robotLandmarks, segmentLength, soleRefs, type KeyMap, type RobotLandmarks } from './retargetRobot';

export interface RetargetOptions {
  bones?: Partial<Record<Keypoint, string>>;
  joints?: Partial<Record<Keypoint, string>>;
  fps?: number;
  start?: number;
  end?: number;
  inPlace?: boolean;
  loop?: boolean;
  name?: string;
}

export interface RetargetResult {
  animation: RobotAnimation;
  error: Partial<Record<Keypoint, number>>;
  mapped: Array<{ keypoint: Keypoint; bone: string; joint: string }>;
  notes: string[];
}

const LIMBS: Array<{ chain: Keypoint[]; weight: number[] }> = [
  { chain: ['leftHip', 'leftKnee', 'leftAnkle', 'leftToe'], weight: [0, 1, 1.4, 0.5] },
  { chain: ['rightHip', 'rightKnee', 'rightAnkle', 'rightToe'], weight: [0, 1, 1.4, 0.5] },
  { chain: ['leftShoulder', 'leftElbow', 'leftWrist'], weight: [0, 1, 1.2] },
  { chain: ['rightShoulder', 'rightElbow', 'rightWrist'], weight: [0, 1, 1.2] },
];

const LIMB_KEYPOINT = /Knee|Ankle|Elbow|Wrist/;

type Positions = Map<string, THREE.Vector3>;

type Human = Map<Keypoint, THREE.Vector3>;

type FrameRoot = { position: V3; rotation: V3 };

interface Retargeting {
  m: Mocap;
  robot: RobotLandmarks;
  opts: RetargetOptions;
  fps: number;
  bones: KeyMap;
  face: THREE.Quaternion;
  faceInv: THREE.Quaternion;
  scale: number;
  hips0: THREE.Vector3;
  hipsRest: THREE.Vector3;
}

const boneAt = (bones: KeyMap, pos: Positions, k: Keypoint) => (bones[k] ? pos.get(bones[k]!) : undefined);

function facing(m: Mocap, bones: KeyMap): THREE.Quaternion {
  const face = new THREE.Quaternion();
  const rl = boneAt(bones, m.rest, 'leftHip') ?? boneAt(bones, m.rest, 'leftShoulder');
  const rr = boneAt(bones, m.rest, 'rightHip') ?? boneAt(bones, m.rest, 'rightShoulder');

  if (!rl || !rr) return face;

  const up = new THREE.Vector3(0, 1, 0);
  const left = rl.clone().sub(rr).setY(0).normalize();
  const fwd = left.clone().cross(up).normalize();

  return face.setFromUnitVectors(fwd, new THREE.Vector3(0, 0, 1));
}

function legLength(pos: (k: Keypoint) => THREE.Vector3 | undefined): number | null {
  const a = pos('leftHip'),
    b = pos('leftKnee'),
    c = pos('leftAnkle');

  return a && b && c ? a.distanceTo(b) + b.distanceTo(c) : null;
}

function bodyScale(m: Mocap, bones: KeyMap, robot: RobotLandmarks) {
  const humanLeg = legLength((k) => boneAt(bones, m.rest, k));
  const robotLeg = legLength((k) => robot.rp.get(k));
  const heightRatio = () => (robot.rp.get('hips')!.y || 500) / Math.max(boneAt(bones, m.rest, 'hips')?.y ?? 1, 1e-3);
  const scale = humanLeg && robotLeg ? robotLeg / humanLeg : heightRatio();

  return { humanLeg, scale, byHeight: !humanLeg || !robotLeg };
}

function humanPose(rt: Retargeting, pos: Positions): Human {
  const human: Human = new Map();

  for (const k of KEYPOINTS) {
    const p = boneAt(rt.bones, pos, k);

    if (p) human.set(k, p.clone().sub(rt.hipsRest).applyQuaternion(rt.face));
  }

  return human;
}

function frameRoot(rt: Retargeting, pos: Positions, t: number): FrameRoot {
  const hipNow = boneAt(rt.bones, pos, 'hips')!;
  const travel = hipNow
    .clone()
    .sub(rt.opts.inPlace ? new THREE.Vector3(hipNow.x, rt.hips0.y, hipNow.z) : rt.hips0)
    .applyQuaternion(rt.face)
    .multiplyScalar(rt.scale);
  const q = rt.face.clone().multiply(rt.m.rootQuaternion(t)).multiply(rt.faceInv);
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  return {
    position: [travel.x, travel.y, travel.z].map((v) => Math.round(v * 10) / 10) as V3,
    rotation: [euler.x, euler.y, euler.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10) as V3,
  };
}

function lowestAnkle(rt: Retargeting, pos: Positions): number {
  const ankles = (['leftAnkle', 'rightAnkle'] as Keypoint[])
    .map((k) => boneAt(rt.bones, pos, k)?.y)
    .filter((v): v is number => v !== undefined);

  return ankles.length ? Math.min(...ankles) : 0;
}

function posedLandmark(rt: Retargeting, k: Keypoint, values: JointValues, root: RootOffset): THREE.Vector3 | null {
  const c = carrierOf(rt.robot, k);

  if (!c) return null;

  const { rig } = rt.robot;
  const posed = forwardKinematics(rig, { values, root });
  const owner = rig.ownerOf.get(c.partId);
  const mat = (owner && posed.joint.get(owner)) || posed.root;

  return new THREE.Vector3(...c.point).applyMatrix4(mat);
}

function humanDir(human: Human, a: Keypoint, b: Keypoint): THREE.Vector3 | null {
  const pa = human.get(a),
    pb = human.get(b);

  return pa && pb ? pb.clone().sub(pa).normalize() : null;
}

function torsoTargets(rt: Retargeting, human: Human, values: JointValues, root: FrameRoot): IkTarget[] {
  const { robot } = rt;
  const targets: IkTarget[] = [];
  const hipsPosed = robot.rp
    .get('hips')!
    .clone()
    .applyMatrix4(forwardKinematics(robot.rig, { values: {}, root }).root);

  for (const [a, b, w, js] of [
    ['hips', 'chest', 0.6, robot.torsoJoints],
    ['chest', 'head', 0.3, robot.neckJoints],
  ] as const) {
    if (!js.length) continue;

    const d = humanDir(human, a, b);
    const c = carrierOf(robot, b);
    const from = d && c && (a === 'hips' ? hipsPosed : posedLandmark(rt, a, values, root));

    if (!d || !c || !from) continue;

    const target = from.clone().addScaledVector(d, segmentLength(robot, a, b));

    targets.push({ partId: c.partId, point: c.point, target: [target.x, target.y, target.z], weight: w });
  }

  return targets;
}

function limbStart(rt: Retargeting, k: Keypoint, values: JointValues, root: FrameRoot): THREE.Vector3 | null {
  const posed = posedLandmark(rt, k, values, root);

  if (posed) return posed;

  const rest = rt.robot.rp.get(k);

  return rest ? rest.clone().applyMatrix4(forwardKinematics(rt.robot.rig, { values, root }).root) : null;
}

function chainTargets(rt: Retargeting, human: Human, limb: (typeof LIMBS)[number], start: THREE.Vector3) {
  const out: Array<{ key: Keypoint; target: IkTarget }> = [];
  let from = start;

  for (let i = 1; i < limb.chain.length; i++) {
    const a = limb.chain[i - 1],
      b = limb.chain[i];
    const d = humanDir(human, a, b);
    const c = carrierOf(rt.robot, b);
    const len = segmentLength(rt.robot, a, b);

    if (!d || !c || !len) break;

    const target = from.clone().addScaledVector(d, len);

    out.push({
      key: b,
      target: { partId: c.partId, point: c.point, target: [target.x, target.y, target.z], weight: limb.weight[i] },
    });
    from = target;
  }

  return out;
}

function limbTargets(rt: Retargeting, human: Human, values: JointValues, root: FrameRoot) {
  const targets: IkTarget[] = [];
  const tagged: Keypoint[] = [];

  for (const limb of LIMBS) {
    const start = limbStart(rt, limb.chain[0], values, root);

    if (!start) continue;

    for (const { key, target } of chainTargets(rt, human, limb, start)) {
      targets.push(target);
      tagged.push(key);
    }
  }

  return { targets, tagged };
}

interface Frame {
  values: JointValues;
  keyframe: AnimationKeyframe;
  tagged: Keypoint[];
  errors: number[];
  low: number;
}

function retargetFrame(rt: Retargeting, f: number, t: number, start: JointValues): Frame {
  const { robot } = rt;
  const pos = rt.m.sample(t);
  const human = humanPose(rt, pos);
  const low = lowestAnkle(rt, pos);
  const root = frameRoot(rt, pos, t);
  const torso = torsoTargets(rt, human, start, root);
  const values = torso.length
    ? solveIK(robot.rig, start, torso, {
        joints: [...robot.torsoJoints, ...robot.neckJoints],
        root,
        prefer: start,
        preferWeight: 0.05,
        iterations: 25,
        stiffTorso: false,
      }).values
    : start;
  const { targets, tagged } = limbTargets(rt, human, values, root);
  const limbJoints = robot.rig.joints
    .filter((j) => isMovable(j) && !robot.torsoJoints.includes(j.id) && !robot.neckJoints.includes(j.id))
    .map((j) => j.id);
  const res = solveIK(robot.rig, values, targets, {
    joints: limbJoints,
    root,
    prefer: values,
    preferWeight: 0.03,
    iterations: f === 0 ? 80 : 25,
  });
  const keyframe = {
    t: Math.round((f / rt.fps) * 1000) / 1000,
    values: Object.fromEntries(Object.entries(res.values).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    root,
  };

  return { values: res.values, keyframe, tagged, errors: res.errors, low };
}

function groundFeet(rig: Rig, soles: Array<{ part: string; p: V3 }>, frames: Frame[], near: number) {
  const ground = Math.min(...frames.map((fr) => fr.low));

  frames.forEach(({ keyframe: k, low: humanLow }) => {
    const posed = forwardKinematics(rig, k);
    const low = Math.min(
      ...soles.map(
        (s) => new THREE.Vector3(...s.p).applyMatrix4(posed.joint.get(rig.ownerOf.get(s.part)!) ?? posed.root).y,
      ),
    );

    if (low < 0 || humanLow - ground < near) k.root!.position![1] = Math.round((k.root!.position![1] - low) * 10) / 10;
  });
}

function averageErrors(frames: Frame[], n: number): Partial<Record<Keypoint, number>> {
  const errSum: Partial<Record<Keypoint, number>> = {};

  for (const fr of frames) fr.tagged.forEach((k, i) => (errSum[k] = (errSum[k] ?? 0) + (fr.errors[i] ?? 0)));

  const error: Partial<Record<Keypoint, number>> = {};

  for (const [k, v] of Object.entries(errSum)) error[k as Keypoint] = Math.round((v! / n) * 10) / 10;

  return error;
}

function mappedKeypoints(robot: RobotLandmarks, bones: KeyMap) {
  return KEYPOINTS.filter((k) => bones[k] && robot.rp.has(k)).map((k) => ({
    keypoint: k,
    bone: bones[k]!,
    joint: robot.joints[k] ?? (k === 'hips' ? 'the body' : 'the end of the limb'),
  }));
}

function runFrames(rt: Retargeting, t0: number, t1: number) {
  const n = Math.max(2, Math.floor((t1 - t0) * rt.fps) + 1);
  const { rig } = rt.robot;
  let values: JointValues = preBend(
    rig,
    {},
    rig.joints.map((j) => j.id),
  );
  const frames: Frame[] = [];

  for (let f = 0; f < n; f++) {
    const frame = retargetFrame(rt, f, t0 + (f / (n - 1)) * (t1 - t0), values);

    values = frame.values;
    frames.push(frame);
  }

  return { frames, n };
}

export function retarget(m: Mocap, rig: Rig, pointOf: PointOf, opts: RetargetOptions = {}): RetargetResult | string {
  const notes: string[] = [];
  const bones = { ...autoMapBones(m), ...opts.bones };
  const robot = robotLandmarks({ rig, pointOf, joints: { ...autoMapRobot(rig), ...opts.joints } });
  const mapped = mappedKeypoints(robot, bones);

  if (mapped.filter((x) => LIMB_KEYPOINT.test(x.keypoint)).length < 2) {
    return 'Couldn’t match the robot’s limbs to the motion. Name the joints left_knee, right_elbow… or map them by hand.';
  }

  const face = facing(m, bones);
  const { humanLeg, scale, byHeight } = bodyScale(m, bones, robot);

  if (byHeight) notes.push('No legs on one side: the body moves by height ratio');

  const t0 = Math.max(0, opts.start ?? 0);
  const t1 = Math.min(m.duration, opts.end ?? m.duration);
  const rt: Retargeting = {
    m,
    robot,
    opts,
    fps: Math.min(Math.max(opts.fps ?? 30, 5), 60),
    bones,
    face,
    faceInv: face.clone().invert(),
    scale,
    hips0: boneAt(bones, m.sample(t0), 'hips')!.clone(),
    hipsRest: boneAt(bones, m.rest, 'hips')!,
  };
  const { frames, n } = runFrames(rt, t0, t1);
  const soles = soleRefs(robot);

  if (soles.length) groundFeet(rig, soles, frames, (humanLeg ?? 100) * 0.04);

  const unmapped = KEYPOINTS.filter((k) => LIMB_KEYPOINT.test(k) && !mapped.some((x) => x.keypoint === k));

  if (unmapped.length) notes.push(`Not matched: ${unmapped.map((k) => KEYPOINT_LABELS[k]).join(', ')}`);

  return {
    animation: {
      id: '',
      name: opts.name ?? m.name,
      duration: Math.round((t1 - t0) * 1000) / 1000,
      loop: opts.loop ?? false,
      keyframes: frames.map((fr) => fr.keyframe),
      interpolation: 'linear',
      source: 'mocap',
    },
    error: averageErrors(frames, n),
    mapped,
    notes,
  };
}
