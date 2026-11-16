import type { RobotJoint } from '../types/robotics';

type Declaration = Pick<RobotJoint, 'id' | 'actuation' | 'actuators' | 'damping' | 'frictionloss'>;

export function actuationProblem(joint: Declaration): string | null {
  if (joint.actuation === 'passive' && joint.actuators?.length)
    return `${joint.id}: a passive joint cannot have actuators`;

  const resistance = [joint.damping, joint.frictionloss].filter((v) => v !== undefined);

  if (!resistance.every((v) => Number.isFinite(v) && v >= 0))
    return `${joint.id}: joint resistance must be finite and nonnegative`;

  return null;
}

export function assertJointActuation(joints: RobotJoint[]) {
  for (const joint of joints) {
    const problem = actuationProblem(joint);

    if (problem) throw new Error(problem);
  }
}
