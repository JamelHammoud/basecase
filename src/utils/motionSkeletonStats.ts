import type { JointValues } from '../types/robotics';
import type { SkeletonJoint } from '../types/skeleton';
import type { MotionJointDynamics } from './motionSkeleton';

export function motionJointSpan(joint: SkeletonJoint, values: readonly JointValues[]): SkeletonJoint {
  let low = Infinity;
  let high = -Infinity;

  for (const frame of values) {
    const angle = frame[joint.id] ?? 0;

    low = Math.min(low, angle);
    high = Math.max(high, angle);
  }

  const margin = (high - low) * 0.1;

  return { ...joint, range: [low - margin, high + margin] };
}

export function motionJointDynamics(
  id: string,
  frames: ReadonlyArray<{ values: JointValues }>,
  frameTime: number,
): MotionJointDynamics {
  let angle = frames[0]?.values[id] ?? 0;
  let speed = 0;
  let peakSpeedDegS = 0;
  let peakAccelerationDegS2 = 0;

  for (let index = 1; index < frames.length; index++) {
    const nextAngle = frames[index].values[id] ?? 0;
    const nextSpeed = (nextAngle - angle) / frameTime;

    peakSpeedDegS = Math.max(peakSpeedDegS, Math.abs(nextSpeed));

    if (index > 1) peakAccelerationDegS2 = Math.max(peakAccelerationDegS2, Math.abs((nextSpeed - speed) / frameTime));

    angle = nextAngle;
    speed = nextSpeed;
  }

  return { id, peakSpeedDegS, peakAccelerationDegS2 };
}
