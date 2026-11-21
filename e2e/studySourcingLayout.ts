import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { expectPanelReadable } from './appearanceLayout';
import { narrowBuildPanel } from './buildAllocationLayout';

export async function sourcingConfigurationLayout(page: Page) {
  await narrowBuildPanel(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const sourcing = page.getByTestId('study-sourcing');
  const quantity = sourcing.getByRole('textbox', { name: 'Quantity', exact: true });
  const destination = sourcing.getByRole('textbox', { name: 'Destination', exact: true });
  const date = sourcing.getByLabel('Required arrival date', { exact: true });
  const run = page.getByRole('button', { name: 'Run Study', exact: true });
  const original = await quantity.inputValue();
  const target = await destination.inputValue();
  const requiredBy = await date.inputValue();

  expect(await quantity.locator('..').textContent()).not.toContain('mm');
  await quantity.fill('100000');
  await quantity.press('Tab');
  await expectPanelReadable(sourcing);

  const choices = (await page.getByTestId('study-knob').last().boundingBox())!;
  const purchasing = (await sourcing.boundingBox())!;

  expect(choices.y + choices.height).toBeLessThanOrEqual(purchasing.y);
  await quantity.fill(original);
  await quantity.press('Tab');
  await destination.fill('');
  expect(await run.isDisabled()).toBe(true);
  await sourcing.getByRole('switch', { name: 'Purchasing', exact: true }).click();
  expect(await sourcing.getByRole('textbox').count()).toBe(0);
  expect(await run.isEnabled()).toBe(true);
  await sourcing.getByRole('switch', { name: 'Purchasing', exact: true }).press('Space');
  expect(await run.isDisabled()).toBe(true);
  await destination.fill(target);
  await date.fill(requiredBy);
  await quantity.fill(original);
  await quantity.press('Tab');
  expect(await run.isEnabled()).toBe(true);
}

export async function compareSourcingOffers(page: Page) {
  const rows = page.getByRole('table', { name: 'Study designs' }).getByTestId('study-row');

  await rows.filter({ hasText: 'Arrives after required date' }).click({ modifiers: ['Shift'] });

  const comparison = page.getByTestId('study-compare').getByTestId('study-row');
  const row = comparison.filter({ hasText: 'Purchasing evidence complete' });

  expect(await comparison.count()).toBe(2);
  await row.getByRole('button', { name: 'Supplier Offers', exact: true }).press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Supplier offers', exact: true });
  const destination = dialog.getByRole('textbox', { name: 'Destination', exact: true });

  await destination.click();
  await destination.fill('CA-BC');
  expect(await destination.inputValue()).toBe('CA-BC');
  expect(await comparison.count()).toBe(2);
  await dialog.getByRole('button', { name: 'Enter Quote', exact: true }).press('Enter');
  expect(await dialog.getByRole('button', { name: 'Add Quote', exact: true }).count()).toBe(1);
  expect(await comparison.count()).toBe(2);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  expect(await dialog.count()).toBe(0);
  expect(await comparison.count()).toBe(2);
}
