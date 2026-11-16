import { beforeEach, expect, it, vi } from 'vitest';
import type { BatterySpec } from '../data/components';
import { premiumPick } from './premiumPick';

const fixture = vi.hoisted(() => ({
  components: [] as { id: string; name: string; battery?: BatterySpec }[],
  prices: new Map<string, number>(),
}));

vi.mock('../data/components', () => ({
  COMPONENTS: fixture.components,
  COMPONENT_BY_ID: { pack: { name: 'Pack', battery: { nominalV: 7.4, capacityAh: 2, cRating: 20 } } },
  actuatorOf: () => undefined,
}));

vi.mock('./actuatorCatalog', () => ({
  unitUsd: (key: string) => fixture.prices.get(key),
  actuatorOptions: () => [],
}));

function candidate(id: string, usd: number | undefined, battery: Partial<BatterySpec> = {}) {
  fixture.components.push({
    id,
    name: id,
    battery: { nominalV: 7.4, fullV: 8.4, capacityAh: 2, cRating: 20, ...battery },
  });

  if (usd !== undefined) fixture.prices.set(`component:${id}`, usd);
}

beforeEach(() => {
  fixture.components.length = 0;
  fixture.prices.clear();
  fixture.prices.set('component:pack', 100);
});

it('selects the lowest compatible price and retains the first equal-price pack across edits', () => {
  candidate('pack', 100);
  candidate('costly', 40);
  candidate('first', 20, { capacityAh: 4, cRating: 10 });
  candidate('tie', 20);
  candidate('voltage', 1, { nominalV: 11.1 });
  candidate('capacity', 1, { capacityAh: 1 });
  candidate('current', 1, { cRating: 19 });
  candidate('cell', 1, { cell: '18650' });
  candidate('unpriced', undefined);

  const before = structuredClone(fixture.components);

  expect(premiumPick('pack')?.cheaper).toEqual({ key: 'component:first', name: 'first', usd: 20 });
  expect(fixture.components).toEqual(before);

  fixture.components.reverse();

  expect(premiumPick('pack')?.cheaper.key).toBe('component:tie');
  fixture.prices.set('component:costly', 10);
  expect(premiumPick('pack')?.cheaper.key).toBe('component:costly');
});

it('requires a priced alternative strictly below half the current price', () => {
  candidate('boundary', 50);
  candidate('nan', Number.NaN);

  expect(premiumPick('pack')).toBeUndefined();
  fixture.prices.set('component:boundary', 49.99);
  expect(premiumPick('pack')?.cheaper.usd).toBeCloseTo(49.99);
  fixture.prices.delete('component:pack');
  expect(premiumPick('pack')).toBeUndefined();
});
