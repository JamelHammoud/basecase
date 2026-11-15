import { planRemoval } from '../assembly/removalOrder';
import { buildRepairPlan, type RepairGeometry } from './repairPlan';
import type { GuidePlan } from './guideTypes';

export interface RepairInput extends RepairGeometry {
  plan: GuidePlan;
  groups: Record<string, string | undefined>;
  target: string;
}

export const repairHandlers = {
  plan: (input: RepairInput) => ({
    result: buildRepairPlan(input.plan, planRemoval(input.geometry, input.groups), input.target, input),
  }),
};
