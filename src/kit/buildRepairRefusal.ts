import type { BuildRepairPlan } from './buildRepairPlan';

const refusals = {
  manufacturing: 'Choose replacements with an exact component or printed-copy source.',
  checks: 'Run Checks on the target revision before repairing this build.',
  identity: 'Resolve the unmatched part identities before repairing this build.',
  topology: 'This topology change needs a new build.',
  group: 'Choose replacements within one supported assembly group.',
  access: 'The retained geometry has no proven removal and reassembly plan.',
};

export const repairRefusalText = (refusal: NonNullable<BuildRepairPlan['refusal']>) => refusals[refusal];
