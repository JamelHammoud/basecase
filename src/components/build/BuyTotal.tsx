import React from 'react';
import { NumberInput, ProgressBar, Tooltip } from '../../design-system';
import type { ProjectSettings } from '../../types/robotics';
import type { Bom } from '../../utils/bom';
import { useMoney } from '../../utils/useMoney';
import { budgetPatch, budgetStanding, budgetStep, hasEstimate, hoursPatch } from './budget';

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
      <ProgressBar
        share={pricedShare}
        behind={estimatedShare}
        tone={over ? 'danger' : 'accent'}
        label="Spent of budget"
      />
      <div className={`text-[12.5px] tabular-nums ${over ? 'text-red-400' : 'text-white/50'}`}>
        {money.format(differenceUsd)} {over ? 'over budget' : 'left'}
      </div>
    </>
  );
};

export const BuyTotal: React.FC<BuyTotalProps> = ({ totals: t, project, onChangeProject }) => {
  const budget = project.budgetUsd;
  const money = useMoney();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Total t={t} />
        <div className="flex shrink-0 gap-2">
          <NumberInput
            className="w-[96px]"
            label={money.symbol}
            value={budget === undefined ? 0 : Math.round(money.amountOf(budget, project.budgetEntered))}
            min={0}
            step={budgetStep(money)}
            precision={0}
            unit=""
            title={`Budget in ${money.code}`}
            onChange={(v, live) => !live && onChangeProject(budgetPatch(v, money))}
          />
          <NumberInput
            className="w-[68px]"
            value={project.budgetHours ?? 0}
            min={0}
            step={1}
            precision={1}
            unit="h"
            title="Budget in hours"
            onChange={(v, live) => !live && onChangeProject(hoursPatch(v))}
          />
        </div>
      </div>
      {budget !== undefined && <BudgetBar t={t} budget={budget} />}
    </>
  );
};
