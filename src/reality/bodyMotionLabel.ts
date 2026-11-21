import { BODY_MOTION_LIMITS, type BodyMotionOutcome } from './bodyMotionTypes';

export function bodyMotionBounds(motion: Extract<BodyMotionOutcome, { kind: 'recommended' }>): string {
  const speed = (motion.speedRadS ?? BODY_MOTION_LIMITS.speedRadS).toPrecision(3);
  const work = motion.plan.workBoundJ.toPrecision(3);

  return `Simulation bounds: ${speed} rad/s, ${motion.plan.seconds} s, ${work} J.`;
}
