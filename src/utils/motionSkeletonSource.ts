import * as THREE from 'three';
import { r3, toCad } from '../agent/agentFrame';
import type { SkeletonJoint, SkeletonLimb, ZUpVec } from '../types/skeleton';
import type { Mocap, MocapRotation } from './mocapBones';

export interface MotionAxis {
  joint: SkeletonJoint;
  values: number[];
}

export interface MotionChain {
  name: string;
  axes: MotionAxis[];
  tip: ZUpVec;
  targets: ZUpVec[];
}

const AXES = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
const tuple = (v: THREE.Vector3): ZUpVec =>
  toCad([v.x, v.y, v.z]).map((value) => (Object.is(value, -0) ? 0 : value)) as ZUpVec;

function axisTuple(v: THREE.Vector3): ZUpVec {
  let axis = tuple(v.normalize());

  for (;;) {
    const length = Math.hypot(...axis);
    const rounded = axis.map((value) => r3(value / length) + 0) as ZUpVec;

    if (rounded.every((value, index) => value === axis[index])) return rounded;

    axis = rounded;
  }
}

const pointOf = (points: Map<string, THREE.Vector3>, name: string) =>
  points.get(name) ?? new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
const limbOf = (name: string): SkeletonLimb => {
  if (/leg|foot|toe|ankle|paw|hoof/i.test(name)) return 'leg';

  if (/arm|hand|wrist/i.test(name)) return 'arm';

  if (/head|neck/i.test(name)) return 'neck';

  return 'other';
};

function ancestors(motion: Mocap, leaf: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();

  for (let at: string | null = leaf; at && !seen.has(at); at = motion.parentOf.get(at) ?? null) {
    seen.add(at);
    chain.unshift(at);
  }

  return chain;
}

function includeLimb(name: string, limbs?: string[]): boolean {
  if (!limbs?.length) return true;

  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const value = compact(name);
  const limb = limbOf(name);

  return limbs.some(
    (item) =>
      value === compact(item) || (compact(item).includes(limb) && value.includes(compact(item).replace(limb, ''))),
  );
}

export function motionLeaves(motion: Mocap, limbs?: string[]): string[] {
  const parents = new Set(motion.parentOf.values());

  return motion.bones.filter(
    (bone) => !parents.has(bone) && includeLimb(motion.endSites?.parentOf.get(bone) ?? bone, limbs),
  );
}

export function motionScale(motion: Mocap, heightMm: number): number {
  const points = [...motion.rest.values()];
  const spans = ['x', 'y', 'z'].map((axis) => {
    const values = points.map((point) => point[axis as 'x' | 'y' | 'z']);

    return Math.max(...values) - Math.min(...values);
  });
  const height = spans[1] > 1e-9 ? spans[1] : Math.max(...spans);

  return heightMm / height;
}

function continuousAngles(angles: number[]): number[] {
  let previous = angles[0];
  let value = 0;

  return angles.map((angle) => {
    const difference = angle - previous;
    const delta = THREE.MathUtils.euclideanModulo(difference + 180, 360) - 180;

    value += delta === -180 && difference > 0 ? 180 : delta;
    previous = angle;

    return value;
  });
}

function axisEntries(options: {
  motion: Mocap;
  leaf: string;
  rotations: Map<string, MocapRotation[]>[];
  first: Map<string, THREE.Vector3>;
  scale: number;
}): MotionAxis[] {
  const { motion, leaf, rotations, first, scale } = options;
  const result: MotionAxis[] = [];
  const orientation = new THREE.Quaternion();

  for (const bone of ancestors(motion, leaf)) {
    const channels = rotations[0].get(bone) ?? [];
    const position = pointOf(first, bone);

    channels.forEach((channel, index) => {
      const axis = AXES[channel.axis].clone().applyQuaternion(orientation);
      const degrees = continuousAngles(rotations.map((frame) => frame.get(bone)?.[index]?.degrees ?? Number.NaN));
      const span = Math.max(...degrees) - Math.min(...degrees);

      orientation.multiply(
        new THREE.Quaternion().setFromAxisAngle(AXES[channel.axis], THREE.MathUtils.degToRad(channel.degrees)),
      );

      if (span < 1e-7) return;

      result.push({
        joint: {
          id: `motion_${motion.bones.indexOf(leaf)}_${motion.bones.indexOf(bone)}_${channel.axis.toLowerCase()}`,
          name: `${bone} ${channel.axis.toLowerCase()}`,
          origin: tuple(position.clone().multiplyScalar(scale)),
          axis: axisTuple(axis),
          type: 'revolute',
          limb: limbOf(leaf),
        },
        values: degrees,
      });
    });
  }

  return result;
}

export function motionChains(motion: Mocap, options: { scale: number; limbs?: string[] }): MotionChain[] {
  const times = Array.from({ length: motion.frames }, (_, frame) => frame * motion.frameTime);
  const frames = times.map((time) => {
    const points = motion.sample(time);
    const root = pointOf(points, motion.root);

    return new Map([...points].map(([name, point]) => [name, point.clone().sub(root)]));
  });
  const rotations = times.map((time) => motion.rotations!(time));

  return motionLeaves(motion, options.limbs).map((leaf) => ({
    name: motion.endSites?.parentOf.get(leaf) ?? leaf,
    axes: axisEntries({ motion, leaf, rotations, first: frames[0], scale: options.scale }),
    tip: tuple(pointOf(frames[0], leaf).clone().multiplyScalar(options.scale)),
    targets: frames.map((frame) => tuple(pointOf(frame, leaf).clone().multiplyScalar(options.scale))),
  }));
}
