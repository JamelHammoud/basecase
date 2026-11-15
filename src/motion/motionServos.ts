import { componentPorts } from '../data/componentPorts';
import { COMPONENT_BY_ID, componentWeightG } from '../data/components';
import { linkLength } from '../agent/skeleton';
import type { RobotSkeleton } from '../types/skeleton';
import { actuatorOptions } from '../utils/actuatorCatalog';
import { jointVerdict, sizeActuators, type Family } from '../utils/actuatorSizing';
import type { MotionSkeletonFit } from '../utils/motionSkeleton';
import { skeletonSizing } from '../utils/skeletonSizing';

const componentOf = (key: string) => key.split('|')[0].replace(/^component:/, '');
const gramsOf = (key: string) => {
  const grams = componentWeightG(componentOf(key));

  if (!grams) throw new Error(`${key}: add the catalog weight before sizing this motion.`);

  return grams;
};
const BASE_G = 150;

export const motionServoOptions = () =>
  actuatorOptions().filter((option) => {
    const id = componentOf(option.key);

    return (
      COMPONENT_BY_ID[id]?.group === 'Servos' &&
      !!componentWeightG(id) &&
      componentPorts(id).some((port) => port.name === 'output')
    );
  });

function estimatedSkeleton(skeleton: RobotSkeleton): RobotSkeleton {
  const joints = skeleton.joints.map((joint) => ({
    ...joint,
    linkMassG: joint.linkMassG ?? 15 + 0.35 * linkLength(skeleton, joint),
    actuator: joint.actuator ?? 'component:feetech-sts3215|c001',
  }));
  const massG = BASE_G + joints.reduce((sum, joint) => sum + joint.linkMassG + gramsOf(joint.actuator), 0);

  return { ...skeleton, joints, massG };
}

function inputFor(skeleton: RobotSkeleton, fit: MotionSkeletonFit) {
  const input = skeletonSizing(skeleton);

  if (typeof input === 'string') throw new Error(input);

  const dynamics = new Map(fit.dynamics.map((joint) => [joint.id, joint]));

  return {
    ...input,
    joints: input.joints.map((joint) => ({ ...joint, ...dynamics.get(joint.id) })),
    options: motionServoOptions(),
  };
}

function pickedSkeleton(skeleton: RobotSkeleton, family: Family): RobotSkeleton {
  const byId = new Map(family.picks.map((pick) => [pick.joint.id, pick.pick!.option.key]));
  const joints = skeleton.joints.map((joint) => ({ ...joint, actuator: byId.get(joint.id)! }));
  const massG = BASE_G + joints.reduce((sum, joint) => sum + (joint.linkMassG ?? 0) + gramsOf(joint.actuator), 0);

  return { ...skeleton, joints, massG };
}

function passes(skeleton: RobotSkeleton, fit: MotionSkeletonFit, family: Family): boolean {
  const input = inputFor(skeleton, fit);
  const picks = new Map(family.picks.map((pick) => [pick.joint.id, pick.pick!.option.act]));

  return input.joints.every(
    (joint) => jointVerdict(joint, joint, picks.get(joint.id)!, family.rail.volts).status === 'pass',
  );
}

export type SizedMotion = MotionSkeletonFit & { volts: number };

export function motionServos(fit: MotionSkeletonFit): SizedMotion | { problem: string; limb?: string } {
  let skeleton = estimatedSkeleton(fit.skeleton);
  const seen = new Set<string>();

  while (true) {
    const families = sizeActuators(inputFor(skeleton, fit));
    const complete = families.filter((family) => !family.failures.length);

    for (const family of complete) {
      const picked = pickedSkeleton(skeleton, family);

      if (passes(picked, fit, family)) return { ...fit, skeleton: picked, volts: family.rail.volts };
    }

    const candidate = complete[0];
    const signature =
      candidate && JSON.stringify([candidate.rail.volts, candidate.picks.map((pick) => pick.pick!.option.key)]);

    if (!candidate || seen.has(signature!)) {
      const joint = families[0]?.failures[0]?.joint ?? skeleton.joints[0];

      return { problem: `No catalog servo can replay ${joint.name ?? joint.id}.`, limb: joint.id };
    }

    seen.add(signature!);
    skeleton = pickedSkeleton(skeleton, candidate);
  }
}
