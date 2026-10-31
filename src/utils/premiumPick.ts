import { COMPONENT_BY_ID, COMPONENTS, actuatorOf, type BatterySpec } from '../data/components';
import { actuatorOptions, unitUsd } from './actuatorCatalog';
import { formatMoney } from './currencyStore';

const PREMIUM = 2;

export interface PremiumPick {
  key: string;
  name: string;
  usd: number;
  cheaper: { key: string; name: string; usd: number };
  why: string;
}

const keyOf = (id: string, variant?: string) => `component:${id}${variant ? `|${variant}` : ''}`;

function actuatorPremium(id: string, variant?: string): PremiumPick | undefined {
  const act = actuatorOf(id, variant);
  const key = keyOf(id, variant);
  const usd = unitUsd(key);

  if (!act?.bus || usd === undefined) return undefined;

  const cheaper = actuatorOptions().find((o) => o.key !== key && o.act.stallNm >= act.stallNm && o.usd * PREMIUM < usd);

  if (!cheaper) return undefined;

  return {
    key,
    name: COMPONENT_BY_ID[id].name,
    usd,
    cheaper: { key: cheaper.key, name: cheaper.name, usd: cheaper.usd },
    why: `at least its stall torque (${cheaper.act.stallNm.toFixed(2)} vs ${act.stallNm.toFixed(2)} N·m)`,
  };
}

const sameBattery = (a: BatterySpec, b: BatterySpec) =>
  !b.cell &&
  b.nominalV === a.nominalV &&
  b.capacityAh >= a.capacityAh &&
  b.capacityAh * b.cRating >= a.capacityAh * a.cRating;

function batteryPremium(id: string): PremiumPick | undefined {
  const battery = COMPONENT_BY_ID[id]?.battery;
  const key = keyOf(id);
  const usd = unitUsd(key);

  if (!battery || battery.cell || usd === undefined) return undefined;

  const cheaper = COMPONENTS.filter((c) => c.id !== id && c.battery && sameBattery(battery, c.battery))
    .map((c) => ({ key: keyOf(c.id), name: c.name, usd: unitUsd(keyOf(c.id)) }))
    .filter((c): c is { key: string; name: string; usd: number } => c.usd !== undefined && c.usd * PREMIUM < usd)
    .sort((a, b) => a.usd - b.usd)[0];

  return (
    cheaper && { key, name: COMPONENT_BY_ID[id].name, usd, cheaper, why: 'the same voltage, capacity and current' }
  );
}

export function premiumPick(componentId: string, variant?: string): PremiumPick | undefined {
  return actuatorPremium(componentId, variant) ?? batteryPremium(componentId);
}

export function premiumText(p: PremiumPick): string {
  return `Premium pick: ${p.name} at ${formatMoney(p.usd)} costs over 2× ${p.cheaper.name} (${formatMoney(p.cheaper.usd)}, ${p.cheaper.key}), which has ${p.why}.`;
}
