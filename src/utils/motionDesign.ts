import { buildSkeleton, linkLength, type SkeletonPayload } from '../agent/skeleton';
import { componentWeightG } from '../data/components';
import { skeletonServos, type ServoPick } from './armServos';
import type { MotionClip } from './motionClip';
import { fitMotionSkeleton, type MotionFit, type MotionRequest } from './motionSkeleton';

export interface MotionDesign extends MotionFit {
  servos: ServoPick;
}

export type MotionDesignResult = { design: MotionDesign } | { problem: string; limb?: string };

const LINK_G = 15;
const LINK_G_PER_MM = 0.35;
const SERVO_G = 55;
const BODY_G_PER_MM = 1;

const servoGrams = (key?: string) => (key && componentWeightG(key.split('|')[0].replace(/^component:/, ''))) || SERVO_G;

function withMass(fit: MotionFit, heightMm: number, actuators: string[] = []): SkeletonPayload {
  const plan = buildSkeleton(fit.skeleton).skeleton;
  const joints = fit.skeleton.joints.map((j, i) => ({
    ...j,
    ...(actuators[i] ? { actuator: actuators[i] } : {}),
    link_mass_g: Math.round(LINK_G + LINK_G_PER_MM * linkLength(plan, plan.joints[i])),
  }));
  const grams = joints.reduce((s, j) => s + j.link_mass_g + servoGrams(j.actuator), 0);

  return { ...fit.skeleton, joints, mass_g: Math.round(grams + BODY_G_PER_MM * heightMm) };
}

export function designFromMotion(clip: MotionClip, req: MotionRequest): MotionDesignResult {
  const fitted = fitMotionSkeleton(clip, req);

  if (!('fit' in fitted)) return fitted;

  const { fit } = fitted;
  const servos = skeletonServos(buildSkeleton(withMass(fit, req.heightMm)).skeleton, { pace: fit.motion });

  if ('joint' in servos) return { problem: `No servo turns the ${servos.joint} fast and strong enough.` };

  return { design: { ...fit, skeleton: withMass(fit, req.heightMm, servos.keys), servos } };
}
