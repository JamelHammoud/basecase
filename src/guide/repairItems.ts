import type { GuidePlan, GuideStep } from './guideTypes';

export function repairCallout(plan: GuidePlan, ids: string[], includeInserts = false): GuideStep['callout'] {
  return plan.items.flatMap((item) => {
    if (!includeInserts && item.hardware?.type === 'heat_insert') return [];

    const qty = item.partIds.filter((id) => ids.includes(id)).length;

    return qty ? [{ key: item.key, qty }] : [];
  });
}

export function repairTools(plan: GuidePlan, callout: GuideStep['callout']): string[] {
  const keys = new Set(callout.map((entry) => entry.key));

  return plan.tools
    .filter((tool) => tool.icon !== 'printer' && tool.itemKeys.some((key) => keys.has(key)))
    .map((tool) => tool.id);
}
