import { describe, expect, it } from 'vitest';
import { toCad } from '../agent/agentFrame';
import { buildSkeleton } from '../agent/skeleton';
import { actuatorOf } from '../data/components';
import type { RobotSkeleton, SkeletonJoint, ZUpVec } from '../types/skeleton';
import { ratingAt } from './actuatorRules';
import type { V3 } from './kinematicsRig';
import { parseBvh } from './mocap';
import { walkBvh, waveBvh } from './mocap.fixtures';
import { fitMotion, type MotionFit, type MotionRequest } from './motionSkeleton';
import {
  ARM_HEIGHT,
  ARM_LINKS,
  LEG_LINKS,
  PAN_TILT_HEIGHT,
  panTiltBvh,
  planarArmBvh,
  trotBvh,
} from './motionSkeleton.fixtures';
import { reachWithTip, skeletonRig } from './skeletonRig';

const TOLERANCE = 2;

function fit(text: string, req: Partial<Omit<MotionRequest, 'mocap'>> = {}): MotionFit {
  const result = fitMotion({ mocap: parseBvh(text, 'Clip'), heightMm: 300, toleranceMm: TOLERANCE, ...req });

  if (!('fit' in result)) throw new Error(result.problem);

  return result.fit;
}

const skeletonOf = (f: MotionFit) => buildSkeleton(f.skeleton).skeleton;

const distance = (a: ZUpVec, b: ZUpVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function links(chain: SkeletonJoint[]): number[] {
  const last = chain[chain.length - 1];

  return [...chain.slice(1).map((j, i) => distance(chain[i].origin, j.origin)), distance(last.origin, last.tip!)];
}

function chainTo(skeleton: RobotSkeleton, leaf: SkeletonJoint): SkeletonJoint[] {
  const byId = new Map(skeleton.joints.map((j) => [j.id, j]));
  const out = [leaf];

  for (let at = leaf.parent; at; at = byId.get(at)?.parent) out.unshift(byId.get(at)!);

  return out;
}

const leaves = (s: RobotSkeleton) => s.joints.filter((j) => !s.joints.some((k) => k.parent === j.id));

function rpmOf(key: string, volts: number): number {
  const [head, variant] = key.replace(/^component:/, '').split('|');

  return ratingAt(actuatorOf(head, variant)!, volts).rpm ?? 0;
}

describe('fitMotion', () => {
  it('recovers a 3-joint planar arm and its link lengths within 1 mm', () => {
    const s = skeletonOf(fit(planarArmBvh(), { heightMm: ARM_HEIGHT }));

    expect(s.joints).toHaveLength(3);
    expect(s.joints.map((j) => j.id)).toEqual(['shoulder_roll', 'elbow_roll', 'wrist_roll']);

    links(s.joints).forEach((l, i) => expect(Math.abs(l - ARM_LINKS[i]), `link ${i}`).toBeLessThan(1));
  });

  it('recovers a pan-tilt head from a nod and a shake as 2 joints', () => {
    const s = skeletonOf(fit(panTiltBvh(), { heightMm: PAN_TILT_HEIGHT * 2 }));

    expect(s.joints).toHaveLength(2);
    expect(s.joints.every((j) => j.limb === 'neck')).toBe(true);
    expect(new Set(s.joints.map((j) => j.id.split('_').pop()))).toEqual(new Set(['yaw', 'pitch']));
  });

  it('drops a joint the clip holds still', () => {
    const s = skeletonOf(fit(planarArmBvh({ elbow: () => 30 }), { heightMm: ARM_HEIGHT }));

    expect(s.joints.map((j) => j.id)).toEqual(['shoulder_roll', 'wrist_roll']);
  });

  it('never gives fewer joints at a tighter tolerance', () => {
    const counts = [40, 15, 5, 2, 1].map((toleranceMm) => fit(walkBvh(), { heightMm: 600, toleranceMm }).joints.length);

    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });

  it('doubles every link when the height doubles', () => {
    const one = skeletonOf(fit(planarArmBvh(), { heightMm: ARM_HEIGHT }));
    const two = skeletonOf(fit(planarArmBvh(), { heightMm: ARM_HEIGHT * 2 }));

    links(two.joints).forEach((l, i) => expect(l).toBeCloseTo(2 * links(one.joints)[i], 0));
  });

  it('gives every joint a range that covers its span in the clip', () => {
    const f = fit(planarArmBvh(), { heightMm: ARM_HEIGHT });
    const ranges = new Map(f.skeleton.joints.map((j) => [j.id, j.range!]));

    for (const j of f.joints) {
      const [lo, hi] = ranges.get(j.id)!;

      expect(lo).toBeLessThanOrEqual(j.spanDeg[0]);
      expect(hi).toBeGreaterThanOrEqual(j.spanDeg[1]);
    }

    expect(f.joints[0].spanDeg[1] - f.joints[0].spanDeg[0]).toBeCloseTo(80, 0);
  });

  it('picks a servo at least as fast on every joint for a faster clip', () => {
    const slow = fit(planarArmBvh(), { heightMm: ARM_HEIGHT });
    const fast = fit(planarArmBvh({ frameTime: 1 / 90 }), { heightMm: ARM_HEIGHT });

    expect(fast.joints[0].speedDps / slow.joints[0].speedDps).toBeCloseTo(3, 0);

    for (const j of slow.joints) {
      const rpm = (f: MotionFit) => rpmOf(f.servos!.keys[j.id], f.servos!.volts);

      expect(rpm(fast), j.id).toBeGreaterThanOrEqual(rpm(slow));
      expect(rpm(fast) * 6, j.id).toBeGreaterThan(fast.joints.find((k) => k.id === j.id)!.speedDps);
    }
  });

  it('keeps the peak speed of a short, high-rate clip instead of smoothing it away', () => {
    const speeds = (frameTime: number) =>
      fit(planarArmBvh({ frameTime }), { heightMm: ARM_HEIGHT }).joints.map((j) => j.speedDps);
    const at300 = speeds(1 / 300);
    const at1000 = speeds(1 / 1000);

    at300.forEach((s, i) => expect(at1000[i] / s).toBeCloseTo(10 / 3, 0));
  });

  it('fits a right arm to the wave whose wrist follows the clip within tolerance', () => {
    const mocap = parseBvh(waveBvh(), 'Wave');
    const result = fitMotion({ mocap, heightMm: 300, toleranceMm: TOLERANCE });

    if (!('fit' in result)) throw new Error(result.problem);

    const s = skeletonOf(result.fit);
    const arm = s.joints.filter((j) => j.id.startsWith('right_'));
    const wrist = leaves(s).find((j) => j.id.startsWith('right_'))!;
    const rig = skeletonRig(s);
    const { mmPerUnit, shift } = result.fit.placement;
    let seed = {};

    expect(arm.length).toBeGreaterThan(0);
    expect(arm.every((j) => j.limb === 'arm')).toBe(true);
    expect(s.joints).toEqual(arm);

    for (let f = 0; f < mocap.frames; f += 3) {
      const hand = mocap.sample(f * mocap.frameTime).get('RightHand')!;
      const at = toCad(hand.toArray().map((v, k) => v * mmPerUnit + shift[k]) as V3);
      const reach = reachWithTip(rig, { joint: wrist.id, point: wrist.tip! }, at, seed);

      expect(reach.errorMm, `frame ${f}`).toBeLessThanOrEqual(TOLERANCE);
      seed = reach.values;
    }
  });

  it('gives a trotting quadruped four matching legs', () => {
    const s = skeletonOf(fit(trotBvh(), { heightMm: 210 }));
    const legs = leaves(s).map((leaf) => chainTo(s, leaf));
    const scale = 210 / (LEG_LINKS[0] + LEG_LINKS[1]);

    expect(legs).toHaveLength(4);
    expect(s.joints.every((j) => j.limb === 'leg')).toBe(true);

    for (const leg of legs) {
      expect(leg).toHaveLength(2);
      links(leg).forEach((l, i) => expect(l).toBeCloseTo(LEG_LINKS[i] * scale, 0));
    }

    expect(s.pairs).toEqual(
      expect.arrayContaining([
        ['front_left_hip_pitch', 'front_right_hip_pitch'],
        ['rear_left_knee_pitch', 'rear_right_knee_pitch'],
      ]),
    );
  });

  it('refuses an impossible tolerance and names the limb', () => {
    const result = fitMotion({ mocap: parseBvh(planarArmBvh(), 'Arm'), heightMm: ARM_HEIGHT, toleranceMm: 1e-6 });

    expect(result).toEqual({ problem: expect.stringMatching(/^Tip /), limb: 'Tip' });
  });

  it('gives the same skeleton for the same input', () => {
    expect(fit(walkBvh(), { heightMm: 600 })).toEqual(fit(walkBvh(), { heightMm: 600 }));
  });
});
