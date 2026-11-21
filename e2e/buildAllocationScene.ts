import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { kitFixture } from '../src/kit/kit.fixtures';
import { box } from '../src/sim/fixtures/parts';

export const motor = 'component:feetech-sts3215|c001';

export async function purchasing(page: Page, directory: string) {
  await page.route(/\/api\/bridge\/(purchases|purchase-save)$/, async (route) => {
    try {
      const saved = route.request().url().endsWith('/purchase-save')
        ? savePurchase(directory, route.request().postDataJSON())
        : listPurchases(directory);

      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(saved) });
    } catch (error) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: String(error) }),
      });
    }
  });
}

export async function create(page: Page, name: string, quantity = 1) {
  await page.getByRole('tab', { name: /Build$/ }).click();
  await page.getByRole('button', { name: 'Make Build', exact: true }).click();
  await page.getByRole('textbox', { name: 'Build name', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill(String(quantity));
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).press('Tab');
  await page
    .getByRole('dialog', { name: 'Make Build', exact: true })
    .getByRole('button', { name: 'Make', exact: true })
    .click();
  await expect
    .poll(() => page.getByRole('button', { name: quantity === 1 ? name : `${name} 1`, exact: true }).count())
    .toBe(1);
}

export function rover() {
  const job = kitFixture('differential rover');

  return {
    name: 'Production rover',
    parts: [
      ...job.parts,
      { ...box('mounting-tab', [0, 80, 0], [20, 5, 20], 1), name: 'Mounting tab', print: { copies: 2 } },
    ],
    project: { ...job.project, labelParts: false },
  };
}
