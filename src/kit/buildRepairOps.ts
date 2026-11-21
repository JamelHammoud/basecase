import { readFrozenKit } from './frozenKit';
import type { PreparedFrozenKit } from './frozenContent';
import { planBuildRevisionRepair } from './buildRepairPlan';

export interface BuildRepairInput {
  source: PreparedFrozenKit;
  target: PreparedFrozenKit;
}

export const buildRepairHandlers = {
  prepare: ({ source, target }: BuildRepairInput) => {
    const plan = planBuildRevisionRepair(readFrozenKit(source), readFrozenKit(target));

    return { result: { ...plan, source: source.hash, target: target.hash } };
  },
};
