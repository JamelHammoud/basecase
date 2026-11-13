import React from 'react';
import { NumberInput, Tooltip } from '../../design-system';
import type { ProjectSettings } from '../../types/robotics';
import { type Bom, STALE_DAYS } from '../../utils/bom';
import { useMoney } from '../../utils/useMoney';
import { budgetPatch, budgetStanding, budgetStep, hasEstimate } from './budget';
import { plural } from './format';

type Totals = Bom['totals'];

interface BuyTotalProps {
  totals: Totals;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

const Total: React.FC<{ t: Totals }> = ({ t }) => {
  const money = useMoney();
  const total = (
    <div className="text-[20px] font-semibold tabular-nums text-white/90 leading-tight w-fit">
      {hasEstimate(t) && <span className="text-white/50 font-normal mr-1">≈</span>}
      {money.format(t.estimatedUsd)}
    </div>
  );

  if (!hasEstimate(t)) return total;

  return <Tooltip label="Checked prices, plus maker and distributor list prices for the rest">{total}</Tooltip>;
};

const BudgetBar: React.FC<{ t: Totals; budget: number }> = ({ t, budget }) => {
  const money = useMoney();
  const { over, differenceUsd, pricedShare, estimatedShare } = budgetStanding(t, budget);

  return (
    <>
      <div className="relative h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-label="Spent of budget">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${over ? 'bg-red-500/40' : 'bg-[#0d99ff]/35'}`}
          style={{ width: `${estimatedShare * 100}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${over ? 'bg-red-500' : 'bg-[#0d99ff]'}`}
          style={{ width: `${pricedShare * 100}%` }}
        />
      </div>
      <div className={`text-[12.5px] tabular-nums ${over ? 'text-red-400' : 'text-white/50'}`}>
        {money.format(differenceUsd)} {over ? 'over budget' : 'left'}
      </div>
    </>
  );
};

const StaleNotice: React.FC<{ stale: number }> = ({ stale }) => (
  <div className="text-[12.5px] text-amber-400">
    Recheck {stale} {plural(stale, 'price', 'prices')} before ordering. {plural(stale, 'It’s', 'They’re')} over{' '}
    {STALE_DAYS} days old.
  </div>
);

export const BuyTotal: React.FC<BuyTotalProps> = ({ totals: t, project, onChangeProject }) => {
  const budget = project.budgetUsd;
  const money = useMoney();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Total t={t} />
        <div className="w-[112px] shrink-0">
          <NumberInput
            label={money.symbol}
            value={budget === undefined ? 0 : Math.round(money.amountOf(budget, project.budgetEntered))}
            min={0}
            step={budgetStep(money)}
            precision={0}
            unit=""
            title={`Budget in ${money.code}`}
            onChange={(v, live) => !live && onChangeProject(budgetPatch(v, money))}
          />
        </div>
      </div>
      {budget !== undefined && <BudgetBar t={t} budget={budget} />}
      {t.stale > 0 && <StaleNotice stale={t.stale} />}
    </>
  );
};
