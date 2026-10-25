import React from 'react';
import { NumberInput, Section, Tooltip } from '../../design-system';
import type { ProjectSettings } from '../../types/robotics';
import { type Bom, STALE_DAYS } from '../../utils/bom';
import { money, plural } from './format';

type Totals = Bom['totals'];

interface BudgetSectionProps {
  bom: Bom;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
}

const hasEstimate = (t: Totals) => t.estimatedUsd > t.pricedUsd + 0.005;

const share = (usd: number, budget: number) => (budget ? Math.min(1, usd / budget) : 0);

const Total: React.FC<{ t: Totals }> = ({ t }) => {
  const total = (
    <div className="text-[20px] font-semibold tabular-nums text-white/90 leading-tight w-fit">
      {hasEstimate(t) && <span className="text-white/45 font-normal mr-1">≈</span>}
      {money(t.estimatedUsd)}
    </div>
  );

  if (!hasEstimate(t)) return total;

  return <Tooltip label="Checked prices, plus maker and distributor list prices for the rest">{total}</Tooltip>;
};

const BudgetBar: React.FC<{ t: Totals; budget: number }> = ({ t, budget }) => {
  const over = t.estimatedUsd > budget;

  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-label="Spent of budget">
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${over ? 'bg-red-500/40' : 'bg-[#0d99ff]/35'}`}
        style={{ width: `${share(t.estimatedUsd, budget) * 100}%` }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${over ? 'bg-red-500' : 'bg-[#0d99ff]'}`}
        style={{ width: `${share(t.pricedUsd, budget) * 100}%` }}
      />
    </div>
  );
};

const BudgetLeft: React.FC<{ t: Totals; budget: number }> = ({ t, budget }) => {
  const over = t.estimatedUsd > budget;

  return (
    <div className={`text-[12.5px] tabular-nums ${over ? 'text-red-400' : 'text-white/45'}`}>
      {over ? `${money(t.estimatedUsd - budget)} over budget` : `${money(budget - t.estimatedUsd)} left`}
    </div>
  );
};

const StaleNotice: React.FC<{ stale: number }> = ({ stale }) => (
  <div className="text-[12.5px] text-amber-400">
    Recheck {stale} {plural(stale, 'price', 'prices')} before ordering. {plural(stale, 'It’s', 'They’re')} over{' '}
    {STALE_DAYS} days old.
  </div>
);

export const BudgetSection: React.FC<BudgetSectionProps> = ({ bom, project, onChangeProject }) => {
  const t = bom.totals;
  const budget = project.budgetUsd;

  return (
    <Section title="Budget">
      <div className="flex items-center justify-between gap-3">
        <Total t={t} />
        <div className="w-[112px] shrink-0">
          <NumberInput
            label="$"
            value={budget ?? 0}
            min={0}
            step={10}
            precision={0}
            unit=""
            title="Budget in US dollars"
            onChange={(v, live) => !live && onChangeProject({ budgetUsd: v > 0 ? v : undefined })}
          />
        </div>
      </div>
      {budget !== undefined && <BudgetBar t={t} budget={budget} />}
      {budget !== undefined && <BudgetLeft t={t} budget={budget} />}
      {t.stale > 0 && <StaleNotice stale={t.stale} />}
    </Section>
  );
};
