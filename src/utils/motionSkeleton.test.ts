import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '../agent/skeleton';
import { forwardKinematics } from './kinematicsMotion';
import { parseBvh } from './mocap';
import {
  obliqueAxisBvh,
  panTiltBvh,
  planarBvh,
  quadrupedBvh,
  sharedTorsoBvh,
  waveBvh,
  wrappedHingeBvh,
} from './motionSkeleton.fixtures';
import { motionSkeleton, type MotionSkeletonFit } from './motionSkeleton';
import { motionScale } from './motionSkeletonSource';
import { skeletonRig } from './skeletonRig';

function fit(text: string, heightMm = 240, toleranceMm = 0.1): MotionSkeletonFit {
  const result = motionSkeleton({ motion: parseBvh(text), heightMm, toleranceMm });

  expect(result).not.toHaveProperty('problem');

  if ('problem' in result) throw new Error(result.problem);

  return result;
}

describe('motionSkeleton', () => {
  it('recovers the three joints and link lengths of a planar arm', () => {
    const result = fit(planarBvh());
    const joints = result.skeleton.joints;

    expect(joints).toHaveLength(3);
    expect(new THREE.Vector3(...joints[0].origin).distanceTo(new THREE.Vector3(...joints[1].origin))).toBeCloseTo(
      100,
      5,
    );
    expect(new THREE.Vector3(...joints[1].origin).distanceTo(new THREE.Vector3(...joints[2].origin))).toBeCloseTo(
      80,
      5,
    );
    expect(new THREE.Vector3(...joints[2].origin).distanceTo(new THREE.Vector3(...joints[2].tip!))).toBeCloseTo(60, 5);
    expect(joints.every((joint) => /^[a-z][a-z0-9_]*$/.test(joint.id))).toBe(true);
    expect(result.trajectory).toHaveLength(64);
    expect(result.errors.Tool).toBeLessThanOrEqual(0.1);
  });

  it('finds two ordered axes for nodding and shaking', () => {
    const result = fit(panTiltBvh(), 100);

    expect(result.skeleton.joints).toHaveLength(2);
    expect(result.skeleton.joints.map((joint) => joint.axis)).toEqual([
      [0, 0, 1],
      [1, 0, 0],
    ]);
  });

  it('merges a locked joint and preserves the terminal path', () => {
    const result = fit(planarBvh(true));

    expect(result.skeleton.joints).toHaveLength(2);
    expect(result.errors.Tool).toBeLessThanOrEqual(0.1);
  });

  it('never uses fewer joints when tolerance tightens', () => {
    const counts = [50, 10, 1, 0.1].map((tolerance) => fit(planarBvh(), 240, tolerance).skeleton.joints.length);

    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('doubles all link coordinates when height doubles', () => {
    const small = fit(planarBvh());
    const large = fit(planarBvh(), 480);

    expect(large.skeleton.joints.map((joint) => joint.origin)).toEqual(
      small.skeleton.joints.map((joint) => joint.origin.map((value) => value * 2)),
    );
  });

  it('covers every trajectory angle with a ten percent margin', () => {
    const result = fit(planarBvh());

    for (const joint of result.skeleton.joints) {
      const angles = result.trajectory.map((frame) => frame.values[joint.id]);
      const low = Math.min(...angles);
      const high = Math.max(...angles);
      const margin = (high - low) * 0.1;

      expect(joint.range).toEqual([low - margin, high + margin]);
    }
  });

  it('replays every human wave wrist frame through the returned skeleton rig', () => {
    const text = waveBvh();
    const motion = parseBvh(text);
    const result = fit(text, 300, 1);
    const built = buildSkeleton({ joints: result.skeleton.joints });
    const rig = skeletonRig(built.skeleton);

    expect(built.problems).toEqual([]);

    const wrist = result.skeleton.joints.findLast((joint) => joint.tip);
    const scale = motionScale(motion, 300);

    expect(wrist).toBeDefined();

    for (const frame of result.trajectory) {
      const points = motion.sample(frame.t);
      const target = points.get('RightHand')!.clone().sub(points.get(motion.root)!).multiplyScalar(scale);
      const posed = forwardKinematics(rig, frame);
      const first = motion.sample(0);
      const wristPoint = first.get('RightHand')!.clone().sub(first.get(motion.root)!).multiplyScalar(scale);
      const actual = wristPoint.applyMatrix4(posed.joint.get(wrist!.id)!);

      expect(actual.distanceTo(target)).toBeLessThanOrEqual(1);
    }
  });

  it('fits four matching quadruped legs', () => {
    const result = fit(quadrupedBvh(), 200);

    expect(Object.keys(result.errors)).toHaveLength(4);
    expect(result.skeleton.joints).toHaveLength(8);
    expect(result.skeleton.joints.every((joint) => joint.limb === 'leg')).toBe(true);
  });

  it('refuses a changing-length chain and names its end effector', () => {
    const motion = parseBvh(planarBvh());
    const sample = motion.sample;

    motion.sample = (time) => {
      const points = sample(time);

      if (time > 0) points.get('Tool')!.multiplyScalar(3);

      return points;
    };

    expect(motionSkeleton({ motion, heightMm: 240, toleranceMm: 0.01 })).toMatchObject({
      limb: 'Tool',
      problem: expect.any(String),
    });
  });
});

describe('motionSkeleton source validation', () => {
  it('rejects a non-finite last frame without skipping it', () => {
    const motion = parseBvh(waveBvh());
    const sample = motion.sample;

    motion.sample = (time) => {
      const points = sample(time);

      if (time === (motion.frames - 1) * motion.frameTime) points.get('RightHand')!.x = Number.NaN;

      return points;
    };

    expect(motionSkeleton({ motion, heightMm: 300, toleranceMm: 1 })).toMatchObject({
      limb: 'RightHand',
      problem: expect.any(String),
    });
  });

  it('keeps selected human limb aliases and refuses unmatched limb names', () => {
    const motion = parseBvh(waveBvh());

    for (const endpoint of ['rightArm', 'RightHand']) {
      const result = motionSkeleton({ motion, heightMm: 300, toleranceMm: 1, limbs: [endpoint] });

      expect(result).not.toHaveProperty('problem');

      if ('problem' in result) throw new Error(result.problem);

      expect(Object.keys(result.errors)).toEqual(['RightHand']);
    }

    expect(motionSkeleton({ motion, heightMm: 300, toleranceMm: 1, limbs: ['Tail'] })).toHaveProperty('problem');
  });

  it('shares a source torso when both fitted limbs use the same trajectory', () => {
    const result = fit(sharedTorsoBvh(), 200, 0.1);
    const torso = result.skeleton.joints.filter((joint) => !joint.parent);

    expect(torso).toHaveLength(1);
    expect(result.skeleton.joints).toHaveLength(3);
    expect(result.skeleton.joints.filter((joint) => joint.parent === torso[0].id)).toHaveLength(2);
    expect(Object.values(result.errors).every((error) => error <= 0.1)).toBe(true);
  });

  it('selects numbered endpoints independently', () => {
    const text = quadrupedBvh().replaceAll('FrontLeftFoot', 'Foot1').replaceAll('FrontRightFoot', 'Foot10');
    const result = motionSkeleton({ motion: parseBvh(text), heightMm: 200, toleranceMm: 0.1, limbs: ['Foot1'] });

    expect(result).not.toHaveProperty('problem');

    if ('problem' in result) throw new Error(result.problem);

    expect(Object.keys(result.errors)).toEqual(['Foot1']);
  });

  it('refuses a valid rigid clip when its persisted axes cannot meet the path tolerance', () => {
    const result = motionSkeleton({ motion: parseBvh(panTiltBvh(true)), heightMm: 100, toleranceMm: 1e-12 });

    expect(result).toMatchObject({ limb: 'Head', problem: expect.stringMatching(/path/) });
  });

  it('fits oblique axes in the same form that the skeleton handler persists', () => {
    const result = fit(obliqueAxisBvh(), 300, 0.4);
    const built = buildSkeleton({ joints: result.skeleton.joints });

    expect(built.problems).toEqual([]);
    expect(built.skeleton.joints.map((joint) => joint.axis)).toEqual(result.skeleton.joints.map((joint) => joint.axis));
    expect(motionSkeleton({ motion: parseBvh(obliqueAxisBvh()), heightMm: 300, toleranceMm: 0.3 })).toMatchObject({
      limb: 'Arm',
      problem: expect.stringMatching(/path/),
    });
  });

  it('returns the same skeleton and trajectory for the same clip', () => {
    expect(fit(waveBvh(), 300, 1)).toEqual(fit(waveBvh(), 300, 1));
  });

  it('measures speed and acceleration at the original frame interval', () => {
    const slow = fit(planarBvh(false, 0.1));
    const fast = fit(planarBvh(false, 0.05));

    slow.dynamics.forEach((joint, index) => {
      expect(fast.dynamics[index].peakSpeedDegS).toBeCloseTo(joint.peakSpeedDegS * 2, 4);
      expect(fast.dynamics[index].peakAccelerationDegS2).toBeCloseTo(joint.peakAccelerationDegS2 * 4, 4);
    });
  });

  it('keeps the trajectory and actuator dynamics continuous across an angle wrap', () => {
    const result = fit(wrappedHingeBvh(), 100, 0.1);
    const joint = result.skeleton.joints[0];

    expect(result.skeleton.joints).toHaveLength(1);
    expect(result.trajectory.map((frame) => frame.values[joint.id])).toEqual([0, 5, 10, 15, 20]);
    expect(joint.range).toEqual([-2, 22]);
    expect(result.dynamics[0].peakSpeedDegS).toBe(50);
    expect(result.dynamics[0].peakAccelerationDegS2).toBe(0);
  });
});
