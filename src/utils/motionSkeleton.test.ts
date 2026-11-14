import { describe, expect, it } from 'vitest';
import { toScene } from '../agent/agentFrame';
import { buildSkeleton, linkLength, type SkeletonJointInput } from '../agent/skeleton';
import type { JointValues } from '../types/robotics';
import type { ZUpVec } from '../types/skeleton';
import { actuatorOptions } from './actuatorCatalog';
import { ratingAt } from './actuatorRules';
import { solveIK } from './kinematicsIk';
import { parseBvh } from './mocap';
import { waveBvh } from './mocap.fixtures';
import { motionChains } from './motionChains';
import { clipOf, type MotionClip } from './motionClip';
import { designFromMotion } from './motionDesign';
import { fitMotionSkeleton, type MotionFit, type MotionRequest } from './motionSkeleton';
import { panTiltHead, planarArm, trottingQuadruped } from './motionSkeleton.fixtures';
import { skeletonLink, skeletonRig } from './skeletonRig';

function fitted(clip: MotionClip, req: MotionRequest): MotionFit {
  const result = fitMotionSkeleton(clip, req);

  if (!('fit' in result)) throw new Error(result.problem);

  return result.fit;
}

const lengths = (fit: MotionFit) => {
  const skeleton = buildSkeleton(fit.skeleton).skeleton;

  return skeleton.joints.map((j) => linkLength(skeleton, j));
};

const jointsOf = (fit: MotionFit, limb: string) => fit.limbs.find((l) => l.id === limb)!.joints;

const faster = (clip: MotionClip, factor: number): MotionClip => ({ ...clip, frameTime: clip.frameTime / factor });

const wave = () => clipOf(parseBvh(waveBvh(), 'Wave'));

function replayError(joints: SkeletonJointInput[], effector: number[], frames: ZUpVec[][]) {
  const skeleton = buildSkeleton({ joints }).skeleton;
  const rig = skeletonRig(skeleton);
  const last = joints[joints.length - 1];
  let seed: JointValues = {};
  let worst = 0;

  for (const frame of frames) {
    const target = frame[effector[0]];
    const solved = solveIK(
      rig,
      seed,
      [{ partId: skeletonLink(last.id), point: toScene(last.tip!), target: toScene(target) }],
      { iterations: 60, tolerance: 0.1, preferWeight: 0 },
    );

    worst = Math.max(worst, solved.maxError);
    seed = solved.values;
  }

  return worst;
}

describe('fitMotionSkeleton', () => {
  it('recovers a 3-joint planar arm with its link lengths within 1 mm', () => {
    const fit = fitted(planarArm(), { heightMm: 240, toleranceMm: 1 });

    expect(fit.skeleton.joints.map((j) => j.id)).toEqual(['shoulder_pitch', 'elbow_pitch', 'wrist_pitch']);

    lengths(fit).forEach((mm, i) => expect(Math.abs(mm - [100, 80, 60][i])).toBeLessThanOrEqual(1));
  });

  it('recovers 2 joints from a pan-tilt head that nods and shakes', () => {
    const fit = fitted(panTiltHead(), { heightMm: 200, toleranceMm: 1 });

    expect(fit.skeleton.joints.map((j) => j.axis)).toEqual([
      [0, 0, 1],
      [1, 0, 0],
    ]);
  });

  it('drops a joint the clip holds still', () => {
    const fit = fitted(planarArm({ locked: true }), { heightMm: 240, toleranceMm: 1 });

    expect(fit.skeleton.joints.map((j) => j.id)).toEqual(['shoulder_pitch', 'wrist_pitch']);
  });

  it('never gives fewer joints for a tighter tolerance', () => {
    const counts = [12, 6, 3, 1.5].map((toleranceMm) => fitted(wave(), { heightMm: 300, toleranceMm }).skeleton.joints);

    counts.slice(1).forEach((joints, i) => expect(joints.length).toBeGreaterThanOrEqual(counts[i].length));
  });

  it('doubles the link lengths when the height doubles', () => {
    const one = lengths(fitted(planarArm(), { heightMm: 240, toleranceMm: 1 }));
    const two = lengths(fitted(planarArm(), { heightMm: 480, toleranceMm: 1 }));

    two.forEach((mm, i) => expect(mm).toBeCloseTo(2 * one[i], 0));
  });

  it('gives every joint a range that covers the clip', () => {
    const clip = planarArm();
    const fit = fitted(clip, { heightMm: 240, toleranceMm: 1 });
    const truth = [
      (t: number) => 35 * Math.sin(Math.PI * t),
      (t: number) => 20 + 40 * Math.sin(Math.PI * t + 1),
      (t: number) => 30 * Math.sin(2 * Math.PI * t),
    ];

    fit.skeleton.joints.forEach((j, i) => {
      const angles = clip.frames.map((_, k) => truth[i](k * clip.frameTime) - truth[i](0));
      const span = Math.max(...angles) - Math.min(...angles);
      const [lo, hi] = j.range!;

      expect(hi - lo).toBeGreaterThanOrEqual(span * 1.2 - 0.5);
      expect(Math.min(Math.abs(lo + Math.max(...angles)), Math.abs(lo - Math.min(...angles)))).toBeLessThan(
        span * 0.1 + 1,
      );
    });
  });

  it('gives the human wave a right arm whose wrist replays within tolerance', () => {
    const clip = wave();
    const fit = fitted(clip, { heightMm: 300 });
    const arm = motionChains(clip, 300).find((c) => c.id === 'right_arm')!;
    const joints = fit.skeleton.joints.filter((j) => jointsOf(fit, 'right_arm').includes(j.id));

    expect(fit.toleranceMm).toBe(3);
    expect(fit.skeleton.joints.every((j) => j.limb === 'arm' && j.id.startsWith('right_'))).toBe(true);
    expect(joints.length).toBeGreaterThanOrEqual(2);
    expect(replayError(joints, [arm.rest.length - 1], arm.frames)).toBeLessThanOrEqual(fit.toleranceMm);
    expect(fit.limbs.find((l) => l.id === 'right_arm')!.effectorMm).toBeLessThanOrEqual(fit.toleranceMm);
  });

  it('gives a trotting quadruped four matching legs', () => {
    const fit = fitted(trottingQuadruped(), { heightMm: 240, toleranceMm: 1 });
    const legs = ['front_left_hip', 'front_right_hip', 'rear_left_hip', 'rear_right_hip'];
    const skeleton = buildSkeleton(fit.skeleton).skeleton;
    const legLengths = legs.map((leg) =>
      jointsOf(fit, leg).map((id) =>
        Math.round(
          linkLength(
            skeleton,
            skeleton.joints.find((j) => j.id === id)!,
          ),
        ),
      ),
    );

    expect(skeleton.joints.every((j) => j.limb === 'leg')).toBe(true);
    expect(legLengths.map((l) => l.length)).toEqual([2, 2, 2, 2]);
    legLengths.forEach((l) => expect(l).toEqual(legLengths[0]));
  });

  it('refuses a tolerance no chain meets and names the limb', () => {
    const result = fitMotionSkeleton(planarArm({ stretchMm: 15 }), { heightMm: 240, toleranceMm: 2 });

    expect(result).toEqual({ problem: 'No skeleton keeps the shoulder within 2 mm of its path.', limb: 'shoulder' });
  });

  it('gives the same skeleton for the same input', () => {
    expect(fitMotionSkeleton(wave(), { heightMm: 300 })).toEqual(fitMotionSkeleton(wave(), { heightMm: 300 }));
  });
});

describe('designFromMotion', () => {
  const options = actuatorOptions();
  const degS = (key: string, volts: number) => (ratingAt(options.find((o) => o.key === key)!.act, volts).rpm ?? 0) * 6;

  it('picks a faster or equal servo on every joint for a faster clip', () => {
    const picks = [1, 2, 4].map((factor) => {
      const made = designFromMotion(faster(planarArm(), factor), { heightMm: 240, toleranceMm: 1 });

      if (!('design' in made)) throw new Error(made.problem);

      const { keys, volts } = made.design.servos;

      return keys.map((k) => degS(k, volts));
    });

    picks.slice(1).forEach((speeds, i) => speeds.forEach((s, j) => expect(s).toBeGreaterThanOrEqual(picks[i][j])));
  });

  it('gives every joint a catalog servo that turns faster than the clip needs', () => {
    const made = designFromMotion(wave(), { heightMm: 300 });

    if (!('design' in made)) throw new Error(made.problem);

    const { skeleton, servos, motion } = made.design;

    expect(skeleton.joints.map((j) => j.actuator)).toEqual(servos.keys);
    skeleton.joints.forEach((j) => expect(degS(j.actuator!, servos.volts)).toBeGreaterThan(motion[j.id].peakDegS));
  });
});
