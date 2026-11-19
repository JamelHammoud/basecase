import type { MotionInput, MotionPlan } from './anythingMotion';
import type { Key } from './anythingAugment';
import { planArmMotion } from './armMotion';
import { checkArmMotion } from './armMotionTrial';

function targetParts(input: MotionInput): string[] {
  const explicit = input.spec.intent.flatMap((key) => Object.keys(key.parts ?? {}));
  const joints = new Set(input.spec.intent.flatMap((key) => Object.keys(key.joints ?? {})));
  const bodies = input.model.bodies.filter((b) => b.joint && joints.has(b.joint));

  return [...new Set([...explicit, ...bodies.flatMap((b) => b.parts.slice(0, 1))])];
}

export async function planFixedArm(input: MotionInput, keys: Key[]): Promise<MotionPlan> {
  const parts = targetParts(input);
  const plan = await planArmMotion(input.mj, input.model, {
    parts,
    keys,
    horizonS: input.spec.seconds,
    start: input.environment.reset.pose,
    stop: input.stop,
  });

  if (!plan.controller) return plan;

  return checkArmMotion(input.mj, input.model, {
    controller: plan.controller,
    environment: input.environment,
    parts,
    stop: input.stop,
  });
}
