import { describe, expect, it } from 'vitest';
import type { Bom } from '../../utils/bomTypes';
import { USD_MONEY, createMoney } from '../../utils/currency';
import { budgetPatch, budgetStanding, budgetStep, hasEstimate } from './budget';

const totals = (o: Partial<Bom['totals']>): Bom['totals'] => ({
  checkedUsd: 0,
  pricedUsd: 0,
  checked: 0,
  stale: 0,
  unchecked: 0,
  estimatedUsd: 0,
  unpriced: 0,
  overBudget: false,
  ...o,
});

describe('budgetStanding', () => {
  it('reads what is left against the estimated total, with checked prices as the solid share', () => {
    const standing = budgetStanding(totals({ pricedUsd: 40, estimatedUsd: 60 }), 100);

    expect(standing).toEqual({ over: false, differenceUsd: 40, pricedShare: 0.4, estimatedShare: 0.6 });
  });

  it('goes over when the estimate passes the budget, and the bar stops at full', () => {
    const standing = budgetStanding(totals({ pricedUsd: 90, estimatedUsd: 112 }), 100);

    expect(standing.over).toBe(true);
    expect(standing.differenceUsd).toBeCloseTo(12);
    expect(standing.estimatedShare).toBe(1);
    expect(standing.pricedShare).toBeCloseTo(0.9);
  });

  it('is not over at exactly the budget', () => {
    expect(budgetStanding(totals({ estimatedUsd: 100 }), 100).over).toBe(false);
  });
});

describe('hasEstimate', () => {
  it('marks a total estimated only when list prices add to the checked ones', () => {
    expect(hasEstimate(totals({ pricedUsd: 50, estimatedUsd: 50 }))).toBe(false);
    expect(hasEstimate(totals({ pricedUsd: 50, estimatedUsd: 51 }))).toBe(true);
  });
});

describe('budgetPatch', () => {
  it('clears the budget at zero', () => {
    expect(budgetPatch(0, USD_MONEY)).toEqual({ budgetUsd: undefined, budgetEntered: undefined });
  });

  it('stores a budget in dollars', () => {
    expect(budgetPatch(250, USD_MONEY).budgetUsd).toBe(250);
  });

  it('keeps the amount typed in another currency', () => {
    const money = createMoney('EUR');
    const patch = budgetPatch(200, money);

    expect(patch.budgetUsd).toBeCloseTo(money.toUsd(200));
    expect(money.amountOf(patch.budgetUsd!, patch.budgetEntered)).toBeCloseTo(200);
  });
});

describe('budgetStep', () => {
  it('steps by tens in dollars', () => {
    expect(budgetStep(USD_MONEY)).toBe(10);
  });
});
