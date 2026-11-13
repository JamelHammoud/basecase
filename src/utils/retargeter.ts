import * as THREE from 'three';
import type { AnimationKeyframe, JointValues } from '../types/robotics';
import type { PointOf } from './animationGoals';
import {
  forwardKinematics,
  isMovable,
  preBend,
  solveIK,
  type IkTarget,
  type PosedRig,
  type Rig,
  type V3,
} from './kinematics';
import { autoMapRobot, KEYPOINTS, type Keypoint } from './mocapBones';
import { bodyBasis, calibrator, restBody, type Human, type RestBody } from './retargetBody';
import { carrierOf, robotLandmarks, segmentLength, type KeyMap, type RobotLandmarks } from './retargetRobot';

export type HumanFrame = Readonly<Partial<Record<string, V3>>>;

export interface RetargeterOptions {
  rig: Rig;
  pointOf: PointOf;
  bones?: KeyMap;
  joints?: KeyMap;
  upperBody?: boolean;
  inPlace?: boolean;
  rest?: HumanFrame;
  restFrames?: number;
}

export type FrameRoot = { position: V3; rotation: V3 };

export interface RetargetStep {
  keyframe: AnimationKeyframe & { root: FrameRoot };
  values: JointValues;
  root: FrameRoot;
  error: Partial<Record<Keypoint, number>>;
  lowestAnkle: number;
}

export interface Retargeter {
  robot: RobotLandmarks;
  body: () => RestBody | null;
  step: (human: HumanFrame, t: number, rootQuaternion?: THREE.Quaternion) => RetargetStep | null;
}

interface Limb {
  chain: Keypoint[];
  weight: number[];
  leg: boolean;
}

const LIMBS: Limb[] = [
  { chain: ['leftHip', 'leftKnee', 'leftAnkle', 'leftToe'], weight: [0, 1, 1.4, 0.5], leg: true },
  { chain: ['rightHip', 'rightKnee', 'rightAnkle', 'rightToe'], weight: [0, 1, 1.4, 0.5], leg: true },
  { chain: ['leftShoulder', 'leftElbow', 'leftWrist'], weight: [0, 1, 1.2], leg: false },
  { chain: ['rightShoulder', 'rightElbow', 'rightWrist'], weight: [0, 1, 1.2], leg: false },
];

const still = (): FrameRoot => ({ position: [0, 0, 0], rotation: [0, 0, 0] });

const copyRoot = (r: FrameRoot): FrameRoot => ({ position: [...r.position], rotation: [...r.rotation] });

interface Stream {
  robot: RobotLandmarks;
  opts: RetargeterOptions;
  body: RestBody;
  rest: Human;
  limbJoints: string[];
  hips0: THREE.Vector3 | null;
  root: FrameRoot;
  values: JointValues;
  steps: number;
}

function readFrame(frame: HumanFrame, bones: KeyMap | undefined): Human {
  const human: Human = new Map();

  for (const k of KEYPOINTS) {
    const name = bones ? bones[k] : k;
    const p = name && Object.hasOwn(frame, name) ? frame[name] : undefined;

    if (p) human.set(k, new THREE.Vector3(p[0], p[1], p[2]));
  }

  return human;
}

function humanPose(st: Stream, raw: Human): Human {
  const human: Human = new Map();

  for (const [k, p] of raw) human.set(k, p.clone().sub(st.body.hipsRest).applyQuaternion(st.body.face));

  return human;
}

function rootRotation(st: Stream, raw: Human, given?: THREE.Quaternion): THREE.Quaternion | null {
  if (given) return given;

  const now = bodyBasis(raw, st.body.keys);

  return now && st.body.basis ? now.multiply(st.body.basis.clone().invert()) : null;
}

function frameRoot(st: Stream, raw: Human, given?: THREE.Quaternion): FrameRoot {
  if (st.opts.upperBody) return still();

  const hipNow = raw.get('hips');
  const q0 = rootRotation(st, raw, given);

  if (!hipNow || !q0) return copyRoot(st.root);

  const { face, faceInv, scale } = st.body;
  const hips0 = (st.hips0 ??= hipNow.clone());
  const travel = hipNow
    .clone()
    .sub(st.opts.inPlace ? new THREE.Vector3(hipNow.x, hips0.y, hipNow.z) : hips0)
    .applyQuaternion(face)
    .multiplyScalar(scale);
  const q = face.clone().multiply(q0).multiply(faceInv);
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  return {
    position: [travel.x, travel.y, travel.z].map((v) => Math.round(v * 10) / 10) as V3,
    rotation: [euler.x, euler.y, euler.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10) as V3,
  };
}

function lowestAnkle(raw: Human): number {
  const ankles = (['leftAnkle', 'rightAnkle'] as Keypoint[])
    .map((k) => raw.get(k)?.y)
    .filter((v): v is number => v !== undefined);

  return ankles.length ? Math.min(...ankles) : 0;
}

function posedLandmark(robot: RobotLandmarks, k: Keypoint, posed: PosedRig): THREE.Vector3 | null {
  const c = carrierOf(robot, k);

  if (!c) return null;

  const owner = robot.rig.ownerOf.get(c.partId);
  const mat = (owner && posed.joint.get(owner)) || posed.root;

  return new THREE.Vector3(...c.point).applyMatrix4(mat);
}

function humanDir(human: Human, a: Keypoint, b: Keypoint): THREE.Vector3 | null {
  const pa = human.get(a),
    pb = human.get(b);

  return pa && pb ? pb.clone().sub(pa).normalize() : null;
}

const lost = (st: Stream, human: Human, keys: Keypoint[]) => keys.some((k) => st.rest.has(k) && !human.has(k));

function torsoTargets(st: Stream, human: Human, values: JointValues, root: FrameRoot) {
  const { robot } = st;
  const targets: IkTarget[] = [];
  const joints: string[] = [];
  const hipsPosed = robot.rp
    .get('hips')!
    .clone()
    .applyMatrix4(forwardKinematics(robot.rig, { values: {}, root }).root);

  for (const [a, b, w, js] of [
    ['hips', 'chest', 0.6, robot.torsoJoints],
    ['chest', 'head', 0.3, robot.neckJoints],
  ] as const) {
    if (!js.length) continue;

    const held = lost(st, human, [a, b]);

    if (!held) joints.push(...js);

    const d = !held && humanDir(human, a, b);
    const c = carrierOf(robot, b);
    const from =
      d && c && (a === 'hips' ? hipsPosed : posedLandmark(robot, a, forwardKinematics(robot.rig, { values, root })));

    if (!d || !c || !from) continue;

    const target = from.clone().addScaledVector(d, segmentLength(robot, a, b));

    targets.push({ partId: c.partId, point: c.point, target: [target.x, target.y, target.z], weight: w });
  }

  return { targets, joints };
}

function limbStart(robot: RobotLandmarks, k: Keypoint, posed: PosedRig): THREE.Vector3 | null {
  return posedLandmark(robot, k, posed) ?? robot.rp.get(k)?.clone().applyMatrix4(posed.root) ?? null;
}

function chainTargets(robot: RobotLandmarks, human: Human, limb: Limb, start: THREE.Vector3) {
  const out: Array<{ key: Keypoint; target: IkTarget }> = [];
  let from = start;

  for (let i = 1; i < limb.chain.length; i++) {
    const a = limb.chain[i - 1],
      b = limb.chain[i];
    const d = humanDir(human, a, b);
    const c = carrierOf(robot, b);
    const len = segmentLength(robot, a, b);

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

function limbTargets(st: Stream, human: Human, values: JointValues, root: FrameRoot) {
  const targets: IkTarget[] = [];
  const tagged: Keypoint[] = [];
  const posed = forwardKinematics(st.robot.rig, { values, root });

  for (const limb of LIMBS) {
    if ((limb.leg && st.opts.upperBody) || lost(st, human, limb.chain)) continue;

    const start = limbStart(st.robot, limb.chain[0], posed);

    if (!start) continue;

    for (const { key, target } of chainTargets(st.robot, human, limb, start)) {
      targets.push(target);
      tagged.push(key);
    }
  }

  return { targets, tagged };
}

function solveFrame(st: Stream, human: Human, root: FrameRoot) {
  const { robot } = st;
  const start = st.values;
  const torso = torsoTargets(st, human, start, root);
  const values = torso.targets.length
    ? solveIK(robot.rig, start, torso.targets, {
        joints: torso.joints,
        root,
        prefer: start,
        preferWeight: 0.05,
        iterations: 25,
        stiffTorso: false,
      }).values
    : start;
  const { targets, tagged } = limbTargets(st, human, values, root);
  const res = solveIK(robot.rig, values, targets, {
    joints: st.limbJoints,
    root,
    prefer: values,
    preferWeight: 0.03,
    iterations: st.steps === 0 ? 80 : 25,
  });
  const error: Partial<Record<Keypoint, number>> = {};

  tagged.forEach((k, i) => (error[k] = res.errors[i] ?? 0));

  return { values: res.values, error };
}

function stepFrame(st: Stream, raw: Human, t: number, given?: THREE.Quaternion): RetargetStep {
  const human = humanPose(st, raw);
  const root = frameRoot(st, raw, given);
  const { values, error } = solveFrame(st, human, root);
  const keyframe = {
    t: Math.round(t * 1000) / 1000,
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    root,
  };

  st.values = values;
  st.root = root;
  st.steps++;

  return { keyframe, values, root, error, lowestAnkle: lowestAnkle(raw) };
}

export function createRetargeter(opts: RetargeterOptions): Retargeter {
  const { rig, pointOf } = opts;
  const robot = robotLandmarks({ rig, pointOf, joints: { ...autoMapRobot(rig), ...opts.joints } });
  const calibrate = calibrator(Math.max(1, opts.restFrames ?? 10));
  let st: Stream | null = null;
  const start = (rest: Human): Stream => ({
    robot,
    opts,
    body: restBody(rest, robot),
    rest,
    limbJoints: rig.joints
      .filter((j) => isMovable(j) && !robot.torsoJoints.includes(j.id) && !robot.neckJoints.includes(j.id))
      .map((j) => j.id),
    hips0: null,
    root: still(),
    values: preBend(
      rig,
      {},
      rig.joints.map((j) => j.id),
    ),
    steps: 0,
  });

  if (opts.rest) st = start(readFrame(opts.rest, opts.bones));

  const whenReady = (raw: Human) => {
    const rest = st ? null : calibrate(raw);

    if (rest) st = start(rest);

    return st;
  };

  return {
    robot,
    body: () => st?.body ?? null,
    step: (frame, t, rootQuaternion) => {
      const raw = readFrame(frame, opts.bones);
      const ready = whenReady(raw);

      return ready ? stepFrame(ready, raw, t, rootQuaternion) : null;
    },
  };
}
