import { afterAll, beforeAll, expect, it } from 'vitest';
import { withStoredPurchase } from '../electron/purchaseRecord.mjs';
import type { Purchases } from '../src/types/robotics';
import { servo, type StudioHook } from './buildCheckFixtures';
import { openApp, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const section = (title: RegExp) => app.page.locator(visible('section'), { hasText: title }).first();

const expand = async (row: ReturnType<typeof section>, name: string) => {
  const button = row.getByRole('button', { name: new RegExp(`^${name}`) }).first();

  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
};

beforeAll(async () => {
  let purchases: Purchases = {};

  app = await openApp();
  await app.page.route('**/api/bridge/purchases', (route) => route.fulfill({ json: purchases }));
  await app.page.route('**/api/bridge/purchase-save', (route) => {
    purchases = withStoredPurchase(purchases, route.request().postDataJSON(), '2026-11-13');

    return route.fulfill({ json: purchases });
  });
}, 120000);

afterAll(async () => {
  await app?.close();
});

it('counts servos on hand at $0 in their row, the total and the Budget check, and undoes the count', async () => {
  const dollars = (text: string | null, after = '') =>
    Number(new RegExp(`${after}≈?\\s*\\$([\\d,.]+)`).exec(text ?? '')?.[1].replace(/,/g, '') ?? Number.NaN);
  const bom = section(/^Bill of materials/);
  const row = bom.locator('li').filter({ hasText: 'Feetech STS3215' }).first();
  const count = (n: number) => row.getByRole('button', { name: `${n}×` });
  const budget = section(/^Checks/).locator('li[data-check="Budget"]');
  const total = async () => dollars(await bom.textContent());
  const budgetBom = async () => {
    await expand(budget, 'Budget');

    return dollars(await budget.textContent(), 'BOM ');
  };
  const arm = Array.from({ length: 6 }, (_, i) => ({ ...servo, id: `so101-${i}`, position: [i * 50, 20, 0] }));

  await app.page.evaluate((parts) => {
    const studio = (window as unknown as { __studio: StudioHook }).__studio;

    studio.load({ parts, project: { ...studio.sceneRecord().project, budgetUsd: 100000 } });
  }, arm);
  await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
  await expand(bom, 'Components');
  await expect.poll(() => count(6).count(), { timeout: 10000 }).toBe(1);
  await expect.poll(budgetBom, { timeout: 45000 }).toBeGreaterThan(0);

  const before = { total: await total(), budget: await budgetBom(), row: dollars(await row.textContent()) };

  await count(6).click();
  await app.page.getByRole('textbox', { name: 'On Hand' }).fill('6');
  await app.page.getByRole('textbox', { name: 'On Hand' }).press('Enter');
  await app.page.keyboard.press('Escape');
  await expect.poll(() => count(0).count(), { timeout: 10000 }).toBe(1);
  expect(await row.textContent()).toContain('6 on hand');
  expect(dollars(await row.textContent())).toBe(0);
  await expect.poll(total, { timeout: 10000 }).toBeCloseTo(before.total - before.row, 2);
  await expect.poll(budgetBom, { timeout: 45000 }).toBe(before.budget - Math.round(before.row));

  await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await app.page.keyboard.press('Meta+z');
  await expect.poll(() => count(6).count(), { timeout: 10000 }).toBe(1);
  await expect.poll(total, { timeout: 10000 }).toBeCloseTo(before.total, 2);
  await expect.poll(budgetBom, { timeout: 45000 }).toBe(before.budget);
}, 120000);
