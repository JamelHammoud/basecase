import { describe, expect, it } from 'vitest';
import type { JointValues } from '../types/robotics';
import type { SkeletonJoint } from '../types/skeleton';
import { motionSkeleton } from './motionSkeleton';
import { panTiltBvh, planarBvh, sharedTorsoBvh, wrappedHingeBvh } from './motionSkeleton.fixtures';
import { motionJointDynamics, motionJointSpan } from './motionSkeletonStats';
import { parseBvh } from './mocap';
import { seededRandom } from './seededRandom';

const joint: SkeletonJoint = {
  id: 'hinge',
  name: 'Hinge',
  origin: [10, 20, 30],
  axis: [0, 0, 1],
  range: [-90, 90],
  tip: [40, 50, 60],
};

function referenceSpan(source: SkeletonJoint, values: readonly JointValues[]): SkeletonJoint {
  const angles = values.map((frame) => frame[source.id] ?? 0);
  const low = Math.min(...angles);
  const high = Math.max(...angles);
  const margin = (high - low) * 0.1;

  return { ...source, range: [low - margin, high + margin] };
}

function referenceDynamics(id: string, values: readonly JointValues[], frameTime: number) {
  const angles = values.map((frame) => frame[id] ?? 0);
  const speeds = angles.slice(1).map((angle, index) => (angle - angles[index]) / frameTime);
  const accelerations = speeds.slice(1).map((speed, index) => (speed - speeds[index]) / frameTime);

  return {
    id,
    peakSpeedDegS: Math.max(0, ...speeds.map(Math.abs)),
    peakAccelerationDegS2: Math.max(0, ...accelerations.map(Math.abs)),
  };
}

function compare(values: readonly JointValues[], frameTime: number, source = joint) {
  const frames = values.map((value) => Object.freeze({ values: Object.freeze(value) }));

  expect(motionJointSpan(source, values)).toEqual(referenceSpan(source, values));
  expect(motionJointDynamics(source.id, Object.freeze(frames), frameTime)).toEqual(
    referenceDynamics(source.id, values, frameTime),
  );
}

describe('motion joint statistics', () => {
  it('matches the array calculation across short, missing, signed-zero and nonfinite samples', () => {
    const cases = [
      [],
      [0],
      [-0],
      [15, -30],
      [0, 5, 10, 15, 20],
      [30, 10, -40, 10, 30],
      [undefined, 40, undefined, -10],
      [-0, 0, -0],
      [0, Number.NaN, 10],
      [Infinity],
      [Infinity, Infinity, -Infinity],
      [1e300, -1e300, 1e300],
    ];

    for (const angles of cases) {
      for (const frameTime of [0.01, 0.1, 3, Number.MIN_VALUE]) {
        compare(
          angles.map((angle): JointValues => {
            if (angle === undefined) return {};

            return { hinge: angle };
          }),
          frameTime,
        );
      }
    }
  });

  it('preserves exact finite differences for irregular multi-joint trajectories', () => {
    const random = seededRandom('123456789abcdef00123456789abcdef');

    for (let sample = 0; sample < 80; sample++) {
      const values = Array.from({ length: Math.floor(random() * 90) }, () => ({
        hinge: (random() - 0.5) * 720,
        wrist: (random() - 0.5) * 60,
      }));
      const frameTime = 0.001 + random() * 0.2;

      for (const id of ['hinge', 'wrist', 'missing']) compare(values, frameTime, { ...joint, id });
    }
  });

  it('reads each angle once and recomputes after edits without changing earlier results', () => {
    let reads = 0;
    let angles = [10, 30, -20, 40];
    const values = angles.map((_, index) => ({
      get hinge() {
        reads++;

        return angles[index];
      },
    }));
    const frames = values.map((value) => ({ values: value }));
    const span = motionJointSpan(joint, values);

    expect(reads).toBe(values.length);

    reads = 0;

    const dynamics = motionJointDynamics(joint.id, frames, 0.1);

    expect(reads).toBe(values.length);

    const snapshot = structuredClone({ span, dynamics });

    angles = [15, 15, 15, 15];

    expect(motionJointSpan(joint, values).range).toEqual([15, 15]);
    expect(motionJointDynamics(joint.id, frames, 0.1)).toEqual({
      id: joint.id,
      peakSpeedDegS: 0,
      peakAccelerationDegS2: 0,
    });
    expect({ span, dynamics }).toEqual(snapshot);
    expect(joint.range).toEqual([-90, 90]);
  });

  it('handles recordings beyond the argument limit without materializing channel arrays', () => {
    const values = Array.from({ length: 160_000 }, (_, index) => ({ hinge: index % 2 }));
    const frames = values.map((value) => ({ values: value }));

    expect(motionJointSpan(joint, values).range).toEqual([-0.1, 1.1]);
    expect(motionJointDynamics(joint.id, frames, 0.1)).toEqual({
      id: joint.id,
      peakSpeedDegS: 10,
      peakAccelerationDegS2: 200,
    });
  });

  it.each([
    { name: 'planar arm', text: planarBvh() },
    { name: 'pan and tilt', text: panTiltBvh() },
    { name: 'shared torso', text: sharedTorsoBvh() },
    { name: 'wrapped hinge', text: wrappedHingeBvh() },
  ])('keeps fitted ranges and dynamics for $name', ({ text }) => {
    const motion = parseBvh(text);
    const result = motionSkeleton({ motion, heightMm: 240, toleranceMm: 0.1 });

    expect(result).not.toHaveProperty('problem');

    if ('problem' in result) throw new Error(result.problem);

    const values = result.trajectory.map((frame) => frame.values);

    expect(result.dynamics.map((entry) => entry.id)).toEqual(result.skeleton.joints.map((entry) => entry.id));

    for (const fitted of result.skeleton.joints) {
      expect(fitted.range).toEqual(referenceSpan(fitted, values).range);
      expect(result.dynamics.find((entry) => entry.id === fitted.id)).toEqual(
        referenceDynamics(fitted.id, values, motion.frameTime),
      );
    }
  });
});
