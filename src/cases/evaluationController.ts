import { isRunnablePolicy } from '../skills/policyCheck';
import { hashOf } from '../skills/hash';
import { policyObsSize, type PolicySpec } from '../sim/policy';
import { policyObservation } from '../sim/robotPackage/policyFiles';
import type { CaseRobot, RunOptions } from './runCase';

export type EvaluationController = ReturnType<typeof evaluationController>;

export function evaluationController(value?: unknown) {
  if (value === undefined || value === 'reference')
    return { kind: 'reference' as const, schema: { observation: 'Case probes', action: 'Case reference timeline' } };

  if (!isRunnablePolicy(value)) throw new Error('The retained policy can’t run.');

  return {
    kind: 'policy' as const,
    policy: value,
    schema: {
      observation: policyObservation(value),
      width: policyObsSize(value),
      joints: value.joints,
      defaultPose: value.defaultPose,
      actionScale: value.actionScale,
      controlDt: value.controlDt,
      clock: value.clock ?? null,
    },
  };
}

export function controllerOptions(
  value: EvaluationController,
  robot: CaseRobot,
  engine: string,
): Pick<RunOptions, 'controller' | 'policy'> {
  const policy: PolicySpec | undefined = 'policy' in value ? value.policy : undefined;

  if (hashOf(evaluationController(policy)) !== hashOf(value)) throw new Error('The controller schema differs.');

  if (!policy) return { controller: 'reference' };

  if (
    policy.mujoco !== engine ||
    new Set(policy.joints).size !== policy.joints.length ||
    policy.joints.some((id) => !robot.joints.some((joint) => joint.id === id && joint.actuation !== 'passive'))
  )
    throw new Error('The retained policy doesn’t fit this robot or engine.');

  return { controller: 'policy', policy };
}
