import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PurchasePlan } from '../../types/purchasing';
import type { Purchases } from '../../types/robotics';
import { buildBom } from '../../utils/bom';
import { useSupplierOffers } from './useSupplierOffers';

const studyPlan = { destination: 'US-CA', requiredBy: '2026-12-01' };
const scenePlan = { destination: 'CA-BC', requiredBy: '2026-12-15' };
const purchases: Purchases = { 'purchase-plan:arm': { purchasePlan: scenePlan } };
const bom = buildBom({ parts: [], project: { printer: 'default', material: 'PLA', infillPct: 15 }, measures: {}, purchases });

function editor(initialPlan?: PurchasePlan) {
  const save = vi.fn(async () => {});
  let controls!: ReturnType<typeof useSupplierOffers>;

  function Probe() {
    controls = useSupplierOffers({ bom, purchases, scene: 'arm', save, initialPlan });

    return null;
  }

  renderToStaticMarkup(createElement(Probe));

  return { controls, save };
}

it('opens candidate offers with Study requirements and preserves the scene plan until Save', async () => {
  const before = structuredClone(purchases);
  const { controls, save } = editor(studyPlan);

  expect(controls.plan).toEqual(studyPlan);
  expect(controls.result.plan).toEqual(studyPlan);
  expect(save).not.toHaveBeenCalled();
  expect(purchases).toEqual(before);
  await controls.savePlan();
  expect(save).toHaveBeenCalledExactlyOnceWith('purchase-plan:arm', { purchasePlan: studyPlan });
  expect(purchases).toEqual(before);
});

it('keeps the ordinary Build editor on its saved scene requirements', () => {
  const { controls, save } = editor();

  expect(controls.plan).toEqual(scenePlan);
  expect(controls.result.plan).toEqual(scenePlan);
  expect(save).not.toHaveBeenCalled();
});
