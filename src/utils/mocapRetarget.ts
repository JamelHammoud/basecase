import * as THREE from 'three';
import type { RobotAnimation } from '../types/robotics';
import type { PointOf } from './animationGoals';
import { forwardKinematics, type Rig, type V3 } from './kinematics';
import { autoMapBones, KEYPOINT_LABELS, KEYPOINTS, type Keypoint, type Mocap } from './mocapBones';
import { createRetargeter, type HumanFrame, type Retargeter, type RetargetStep } from './retargeter';
import { soleRefs, type KeyMap, type RobotLandmarks } from './retargetRobot';

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

const LIMB_KEYPOINT = /Knee|Ankle|Elbow|Wrist/;

function groundFeet(rig: Rig, soles: Array<{ part: string; p: V3 }>, frames: RetargetStep[], near: number) {
  const ground = Math.min(...frames.map((fr) => fr.lowestAnkle));

  frames.forEach(({ keyframe: k, lowestAnkle: humanLow }) => {
    const posed = forwardKinematics(rig, k);
    const low = Math.min(
      ...soles.map(
        (s) => new THREE.Vector3(...s.p).applyMatrix4(posed.joint.get(rig.ownerOf.get(s.part)!) ?? posed.root).y,
      ),
    );

    if (low < 0 || humanLow - ground < near) k.root!.position![1] = Math.round((k.root!.position![1] - low) * 10) / 10;
  });
}

function averageErrors(frames: RetargetStep[], n: number): Partial<Record<Keypoint, number>> {
  const errSum: Partial<Record<Keypoint, number>> = {};

  for (const fr of frames)
    for (const [k, v] of Object.entries(fr.error)) errSum[k as Keypoint] = (errSum[k as Keypoint] ?? 0) + v;

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

const plain = (pos: Map<string, THREE.Vector3>): HumanFrame =>
  Object.fromEntries([...pos].map(([name, p]) => [name, [p.x, p.y, p.z] as V3]));

function runFrames(m: Mocap, retargeter: Retargeter, span: { t0: number; t1: number; fps: number }) {
  const { t0, t1, fps } = span;
  const n = Math.max(2, Math.floor((t1 - t0) * fps) + 1);
  const frames: RetargetStep[] = [];

  for (let f = 0; f < n; f++) {
    const t = t0 + (f / (n - 1)) * (t1 - t0);
    const pos = plain(m.sample(t));

    frames.push(retargeter.step(pos, f / fps, m.rootQuaternion(t))!);
  }

  return { frames, n };
}

export function retarget(m: Mocap, rig: Rig, pointOf: PointOf, opts: RetargetOptions = {}): RetargetResult | string {
  const notes: string[] = [];
  const bones = { ...autoMapBones(m), ...opts.bones };
  const retargeter = createRetargeter({
    rig,
    pointOf,
    bones,
    joints: opts.joints,
    inPlace: opts.inPlace,
    rest: plain(m.rest),
  });
  const { robot } = retargeter;
  const mapped = mappedKeypoints(robot, bones);

  if (mapped.filter((x) => LIMB_KEYPOINT.test(x.keypoint)).length < 2) {
    return 'Couldn’t match the robot’s limbs to the motion. Name the joints left_knee, right_elbow… or map them by hand.';
  }

  const { humanLeg, byHeight } = retargeter.body()!;

  if (byHeight) notes.push('No legs on one side: the body moves by height ratio');

  const t0 = Math.max(0, opts.start ?? 0);
  const t1 = Math.min(m.duration, opts.end ?? m.duration);
  const fps = Math.min(Math.max(opts.fps ?? 30, 5), 60);
  const { frames, n } = runFrames(m, retargeter, { t0, t1, fps });
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
