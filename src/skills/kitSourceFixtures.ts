import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { readyStand, holdingPolicy } from './hubSkillFixtures';

function withKitNetwork(policy: PolicySpec): PolicySpec {
  const widths = [policy.obsMean.length, 256, 128, 64, policy.joints.length];

  return {
    ...policy,
    layers: widths.slice(1).map((out, index) => ({
      in: widths[index],
      out,
      w: Array<number>(widths[index] * out).fill(0),
      b: Array<number>(out).fill(0),
    })),
  };
}

export const kitPolicy = (job: Record<string, unknown>) => withKitNetwork(holdingPolicy(job));

export function readyKitSource(model: SimModel, design = model.robots[0].key) {
  const skill = readyStand(model, design);

  if (skill.controller.kind !== 'policy') throw new Error('Expected policy fixture');

  return {
    ...skill,
    controller: {
      ...skill.controller,
      policy: withKitNetwork(skill.controller.policy),
    },
  };
}
