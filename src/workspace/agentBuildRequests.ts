import type { ProjectSettings, Tether } from '../types/robotics';
import { describeKey } from '../utils/bom';
import type { Money } from '../utils/currency';
import { currentMoney } from '../utils/currencyStore';

export interface BuildSettingsPayload {
  extras?: Array<{ key: string; qty: number; note?: string }>;
  budget?: number;
  material?: ProjectSettings['material'];
  tether?: Tether;
}

type Extra = NonNullable<ProjectSettings['extras']>[number];

function mergeExtras(
  current: Extra[] | undefined,
  changes: NonNullable<BuildSettingsPayload['extras']>,
  bad: string[],
) {
  const map = new Map((current ?? []).map((x) => [x.key, x]));

  for (const x of changes.filter((c) => !bad.includes(c.key))) {
    if (x.qty > 0) map.set(x.key, { key: x.key, qty: Math.round(x.qty), note: x.note });
    else map.delete(x.key);
  }

  return [...map.values()];
}

function withBudget(next: ProjectSettings, amount: number, money: Money) {
  const { usd, entered } = money.enter(amount);

  next.budgetUsd = amount > 0 ? usd : undefined;
  next.budgetEntered = amount > 0 ? entered : undefined;
}

export function applyBuildSettings(project: ProjectSettings, pl: BuildSettingsPayload, money = currentMoney()) {
  const bad = (pl.extras ?? []).filter((x) => !describeKey(x.key)).map((x) => x.key);
  const next = { ...project };

  if (pl.extras) next.extras = mergeExtras(next.extras, pl.extras, bad);

  if (pl.budget !== undefined) withBudget(next, pl.budget, money);

  if (pl.material) next.material = pl.material;

  if (pl.tether) next.tether = pl.tether.volts > 0 && pl.tether.amps > 0 ? pl.tether : undefined;

  return { next, bad };
}
