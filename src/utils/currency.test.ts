import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { bomText, bomToCsv, bomToMarkdown, buildBom } from './bom';
import { createMoney } from './currency';
import { currentMoney, refreshRates, setCurrency } from './currencyStore';

const rates = { date: '2026-10-30', perUsd: { USD: 1, EUR: 0.8, JPY: 150 } };
const eur = createMoney('EUR', rates);

const servo: ScenePart = {
  id: 'servo',
  name: 'Hip servo',
  kind: 'component',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
};

describe('currency', () => {
  it('formats each currency the way it is written', () => {
    expect(createMoney('USD', rates).format(1209.5)).toBe('$1,209.50');
    expect(eur.format(10)).toBe('€8.00');
    expect(createMoney('JPY', rates).format(10)).toBe('¥1,500');
    expect(createMoney('XXX', rates).code).toBe('USD');
  });

  it('shows a price typed in the same currency exactly, and converts it otherwise', () => {
    const { usd, entered } = eur.enter(799);

    expect(usd).toBeCloseTo(998.75);
    expect(eur.whole(usd, entered)).toBe('€799');
    expect(createMoney('USD', rates).whole(usd, entered)).toBe('$999');
  });

  it('exports and describes a BOM in the chosen currency', () => {
    const { usd, entered } = eur.enter(400);
    const project: ProjectSettings = {
      printer: 'default',
      material: 'PLA',
      infillPct: 15,
      budgetUsd: usd,
      budgetEntered: entered,
    };
    const purchases = {
      'component:feetech-sts3215|c001': {
        packQty: 1,
        checkedAt: '2026-10-29',
        priceUsd: 20,
        entered: { amount: 16, currency: 'EUR' },
      },
    };
    const bom = buildBom({ parts: [servo], project, purchases, measures: {}, now: new Date('2026-10-30T12:00:00') });

    expect(bomToCsv(bom, {}, eur).split('\n')[0]).toContain('Pack Price (EUR)');
    expect(bomToCsv(bom, {}, eur).split('\n')[1]).toContain(',16.00,16.00,');
    expect(bomToMarkdown(bom, 'Robot', eur)).toContain('- **Budget:** €400.00');
    expect(bomText(bom, {}, eur)).toContain('Budget €400.00. Checked prices total €16.00');
    expect(bomText(bom, {}, eur)).toContain('Prices are in EUR');
  });

  it('keeps the chosen currency and picks up newer rates', async () => {
    setCurrency('EUR');

    const fetcher = async () => Response.json({ date: '2099-01-01', rates: { EUR: 0.5 } });

    await refreshRates(fetcher as typeof fetch, new Date('2099-01-02T12:00:00Z'));

    expect(currentMoney()).toMatchObject({ code: 'EUR', rate: 0.5, ratesDate: '2099-01-01' });
    expect(currentMoney().format(10)).toBe('€5.00');
    setCurrency('USD');
  });
});
