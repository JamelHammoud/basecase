import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { buildBom } from './bom';
import { budgetLine, budgetPlan, budgetPlanText } from './budget';
import { runEngineering } from './engineering';

const component = (id: string, componentId: string, componentVariant?: string): ScenePart => ({
  id,
  name: id,
  kind: 'component',
  componentId,
  componentVariant,
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
});

const parts = [
  ...Array.from({ length: 6 }, (_, i) => component(`s${i}`, 'feetech-sts3250')),
  component('pi', 'raspberry-pi-5'),
];
const withBudget = (budgetUsd: number): ProjectSettings => ({
  printer: 'default',
  material: 'PLA',
  infillPct: 15,
  budgetUsd,
});
const budgetOf = (budgetUsd: number) =>
  runEngineering({ parts, project: withBudget(budgetUsd), measures: {}, servoOutputs: {} }).rows.find(
    (r) => r.check === 'Budget',
  )!;

describe('budget', () => {
  it('compares the list-price estimate with the budget', () => {
    const bom = buildBom({ parts, project: withBudget(500), purchases: {}, measures: {} });

    expect(bom.totals).toMatchObject({ pricedUsd: 0, estimatedUsd: 553.94, overBudget: true });
    expect(budgetLine(bom)).toBe('BOM ≈ $554 of $500 (actuators $444), $54 over');
  });

  it('fails verify_design over budget and warns above 90%', () => {
    expect(budgetOf(500)).toMatchObject({ status: 'fail', items: [{ text: '6× Feetech STS3250: ≈ $444' }, {}] });
    expect(budgetOf(600).status).toBe('warn');
    expect(budgetOf(1000)).toMatchObject({ status: 'pass', detail: 'BOM ≈ $554 of $1,000 (actuators $444)' });
  });

  it('splits a budget and flags the classes that break it', () => {
    const bom = buildBom({ parts, project: withBudget(600), purchases: {}, measures: {} });

    expect(budgetPlan(600, bom).map((p) => [p.cls, Math.round(p.capUsd), Math.round(p.spentUsd), p.over])).toEqual([
      ['actuators', 360, 444, true],
      ['compute', 90, 110, true],
      ['power', 60, 0, false],
    ]);
    expect(budgetPlanText(600, bom)).toContain('Plan broken: actuators $444 > $360; compute $110 > $90.');
  });
});
