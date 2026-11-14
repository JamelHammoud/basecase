import type { ProjectSettings } from '../../types/robotics';
import type { Bom } from '../../utils/bomTypes';
import type { Money } from '../../utils/currency';

type Totals = Bom['totals'];

export interface BudgetStanding {
  over: boolean;
  differenceUsd: number;
  pricedShare: number;
  estimatedShare: number;
}

export const hasEstimate = (t: Totals) => t.estimatedUsd > t.pricedUsd + 0.005;

const share = (usd: number, budget: number) => (budget > 0 ? Math.min(1, usd / budget) : 0);

export function budgetStanding(t: Totals, budgetUsd: number): BudgetStanding {
  const over = t.estimatedUsd > budgetUsd;

  return {
    over,
    differenceUsd: Math.abs(budgetUsd - t.estimatedUsd),
    pricedShare: share(t.pricedUsd, budgetUsd),
    estimatedShare: share(t.estimatedUsd, budgetUsd),
  };
}

export const budgetStep = (money: Money) => 10 ** Math.max(1, Math.round(Math.log10(money.rate * 10)));

export function budgetPatch(amount: number, money: Money): Partial<ProjectSettings> {
  if (amount <= 0) return { budgetUsd: undefined, budgetEntered: undefined };

  const { usd, entered } = money.enter(amount);

  return { budgetUsd: usd, budgetEntered: entered };
}

export const hoursPatch = (hours: number): Partial<ProjectSettings> => ({ budgetHours: hours > 0 ? hours : undefined });
