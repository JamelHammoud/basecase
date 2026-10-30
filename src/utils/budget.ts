import { COMPONENT_BY_ID, type ComponentGroup } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { Bom, BomLine } from './bomTypes';

export type CostClass = 'actuators' | 'compute' | 'power' | 'other';

export const PLAN_SHARES: Record<Exclude<CostClass, 'other'>, { share: number; label: string; hard: boolean }> = {
  actuators: { share: 0.6, label: 'Actuators', hard: true },
  compute: { share: 0.15, label: 'Compute', hard: true },
  power: { share: 0.1, label: 'Power', hard: false },
};

const CLASS_OF_GROUP: Partial<Record<ComponentGroup, CostClass>> = {
  Servos: 'actuators',
  Motors: 'actuators',
  'Linear Actuators': 'actuators',
  Computers: 'compute',
  Microcontrollers: 'compute',
  Power: 'power',
};

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export const lineUsd = (l: BomLine) => (l.status === 'unchecked' ? (l.estUsd ?? 0) : (l.lineUsd ?? 0));

export function costClass(key: string): CostClass {
  const [kind, rest] = key.split(':');
  const id = rest?.split('|')[0] ?? '';

  const group = kind === 'component' ? COMPONENT_BY_ID[id]?.group : undefined;

  if (group) return CLASS_OF_GROUP[group] ?? 'other';

  if (kind === 'supply' && SUPPLY_BY_ID[id]?.group === 'Power') return 'power';

  return 'other';
}

export function costByClass(bom: Bom): Record<CostClass, number> {
  const out: Record<CostClass, number> = { actuators: 0, compute: 0, power: 0, other: 0 };

  for (const l of bom.lines) out[costClass(l.key)] += lineUsd(l);

  return out;
}

export function budgetLine(bom: Bom): string {
  const t = bom.totals;

  if (t.budgetUsd === undefined) return '';

  const acts = costByClass(bom).actuators;
  const over = t.estimatedUsd > t.budgetUsd ? `, ${usd(t.estimatedUsd - t.budgetUsd)} over` : '';

  return `BOM ≈ ${usd(t.estimatedUsd)} of ${usd(t.budgetUsd)}${acts ? ` (actuators ${usd(acts)})` : ''}${over}`;
}

export interface PlanLine {
  cls: Exclude<CostClass, 'other'>;
  label: string;
  capUsd: number;
  spentUsd: number;
  over: boolean;
}

export function budgetPlan(budgetUsd: number, bom?: Bom): PlanLine[] {
  const spent = bom ? costByClass(bom) : undefined;

  return (Object.keys(PLAN_SHARES) as Array<keyof typeof PLAN_SHARES>).map((cls) => {
    const { share, label } = PLAN_SHARES[cls];
    const capUsd = budgetUsd * share;
    const spentUsd = spent?.[cls] ?? 0;

    return { cls, label, capUsd, spentUsd, over: spentUsd > capUsd + 0.5 };
  });
}

export function budgetPlanText(budgetUsd: number, bom?: Bom): string {
  const plan = budgetPlan(budgetUsd, bom);
  const rows = plan.map((p) => {
    const mark = p.over ? ' OVER' : '';
    const so = bom ? `, ${usd(p.spentUsd)} so far${mark}` : '';
    const cap = PLAN_SHARES[p.cls].hard ? 'up to' : 'about';

    return `- ${p.label}: ${cap} ${Math.round(PLAN_SHARES[p.cls].share * 100)}% = ${usd(p.capUsd)}${so}`;
  });
  const broken = plan.filter((p) => p.over);
  const verdict = broken.length
    ? `Plan broken: ${broken.map((p) => `${p.label.toLowerCase()} ${usd(p.spentUsd)} > ${usd(p.capUsd)}`).join('; ')}. Lower the load before buying torque, use gear-ratio versions of one servo family, and tether compute unless the brief says autonomous.`
    : '';

  return [`Budget plan for ${usd(budgetUsd)}:`, ...rows, ...(verdict ? [verdict] : [])].join('\n');
}
