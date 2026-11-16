import * as THREE from 'three';
import { r3, toCad } from '../agent/agentFrame';
import type { SkeletonJoint, SkeletonLimb, ZUpVec } from '../types/skeleton';
import type { Mocap, MocapRotation } from './mocapBones';
import type { MotionFrames } from './motionSkeletonValidation';

export interface MotionAxis {
  joint: SkeletonJoint;
  values: readonly number[];
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
    chain.push(at);
  }

  return chain.reverse();
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
  const bounds = new THREE.Box3();

  for (const point of motion.rest.values()) bounds.expandByPoint(point);

  const vertical = bounds.max.y - bounds.min.y;
  const height =
    vertical > 1e-9 ? vertical : Math.max(bounds.max.x - bounds.min.x, vertical, bounds.max.z - bounds.min.z);

  return heightMm / height;
}

function continuousChannel(rotations: MotionFrames['rotations'], bone: string, index: number) {
  const values: number[] = [];
  let previous = 0;
  let value = 0;
  let low = Infinity;
  let high = -Infinity;

  for (const frame of rotations) {
    const angle = frame.get(bone)?.[index]?.degrees ?? Number.NaN;
    const difference = angle - (values.length ? previous : angle);
    const delta = THREE.MathUtils.euclideanModulo(difference + 180, 360) - 180;

    value += delta === -180 && difference > 0 ? 180 : delta;
    previous = angle;
    values.push(value);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }

  return { values, span: high - low };
}

function channelSamples(rotations: MotionFrames['rotations']) {
  const byBone = new Map<string, Array<MocapRotation & { values: number[]; span: number }>>();

  return (bone: string) => {
    const cached = byBone.get(bone);

    if (cached) return cached;

    const channels = (rotations[0].get(bone) ?? []).map((channel, index) => ({
      ...channel,
      ...continuousChannel(rotations, bone, index),
    }));

    byBone.set(bone, channels);

    return channels;
  };
}

function axisEntries(options: {
  motion: Mocap;
  boneIndices: Map<string, number>;
  leaf: string;
  channelsOf: ReturnType<typeof channelSamples>;
  first: Map<string, THREE.Vector3>;
  scale: number;
}): MotionAxis[] {
  const { motion, boneIndices, leaf, channelsOf, first, scale } = options;
  const result: MotionAxis[] = [];
  const orientation = new THREE.Quaternion();
  const leafIndex = boneIndices.get(leaf) ?? -1;

  for (const bone of ancestors(motion, leaf)) {
    const channels = channelsOf(bone);
    const position = pointOf(first, bone);
    const boneIndex = boneIndices.get(bone) ?? -1;

    channels.forEach((channel) => {
      const axis = AXES[channel.axis].clone().applyQuaternion(orientation);

      orientation.multiply(
        new THREE.Quaternion().setFromAxisAngle(AXES[channel.axis], THREE.MathUtils.degToRad(channel.degrees)),
      );

      if (channel.span < 1e-7) return;

      result.push({
        joint: {
          id: `motion_${leafIndex}_${boneIndex}_${channel.axis.toLowerCase()}`,
          name: `${bone} ${channel.axis.toLowerCase()}`,
          origin: tuple(position.clone().multiplyScalar(scale)),
          axis: axisTuple(axis),
          type: 'revolute',
          limb: limbOf(leaf),
        },
        values: channel.values,
      });
    });
  }

  return result;
}

export function motionChains(
  motion: Mocap,
  samples: MotionFrames,
  options: { scale: number; limbs?: string[] },
): MotionChain[] {
  const { positions: frames, rotations } = samples;
  const channelsOf = channelSamples(rotations);
  const boneIndices = new Map<string, number>();

  motion.bones.forEach((bone, index) => {
    if (!boneIndices.has(bone)) boneIndices.set(bone, index);
  });

  return motionLeaves(motion, options.limbs).map((leaf) => ({
    name: motion.endSites?.parentOf.get(leaf) ?? leaf,
    axes: axisEntries({ motion, boneIndices, leaf, channelsOf, first: frames[0], scale: options.scale }),
    tip: tuple(pointOf(frames[0], leaf).clone().multiplyScalar(options.scale)),
    targets: frames.map((frame) => tuple(pointOf(frame, leaf).clone().multiplyScalar(options.scale))),
  }));
}
