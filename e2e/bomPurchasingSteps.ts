import type { Page } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { expect } from 'vitest';
import { kitArmScene } from '../src/kit/entry.fixtures';
import { parseBomCsv } from './bomCsv';
import type { StudioHook } from './buildCheckFixtures';

export const picoKey = 'component:raspberry-pi-pico-2';
export const picoListing = 'https://www.digikey.com/en/products/detail/raspberry-pi/SC1631/24627136';
export const picoRow = (page: Page) =>
  page.locator('li.group').filter({ hasText: 'Raspberry Pi Pico 2' }).filter({ visible: true });

export async function openPurchasingRobot(page: Page) {
  const scene = kitArmScene();

  scene.name = 'Purchasing arm';
  scene.project = { ...scene.project, ...{ extras: [{ key: picoKey, qty: 3 }] } };
  await page.evaluate((record) => (window as unknown as { __studio: StudioHook }).__studio.load(record), scene);
  await openPurchasingBuild(page);

  return scene;
}

export async function openPurchasingBuild(page: Page) {
  await page.getByRole('tab', { name: 'Build', exact: true }).filter({ visible: true }).click();

  const components = page
    .getByRole('button')
    .filter({ hasText: /^Components/ })
    .filter({ visible: true });

  if ((await components.getAttribute('aria-expanded')) === 'false') await components.click();
}

export async function editPicoIdentity(page: Page, supplierPartNumber = '2648-SC1631CT-ND') {
  await picoRow(page).getByRole('button').last().click();

  const dialog = page.getByRole('dialog', { name: 'Raspberry Pi Pico 2', exact: true });
  const listing = dialog.getByRole('button', { name: 'Listing', exact: true });

  await dialog.getByRole('textbox', { name: 'Price', exact: true }).fill('6.12');

  if ((await listing.getAttribute('aria-expanded')) === 'false') await listing.click();

  await dialog.getByRole('textbox', { name: 'Listing link', exact: true }).fill(picoListing);
  await dialog.getByRole('textbox', { name: 'Manufacturer', exact: true }).fill('Raspberry Pi');
  await dialog.getByRole('textbox', { name: 'Manufacturer part number', exact: true }).fill('SC1631');
  await dialog.getByRole('textbox', { name: 'Supplier', exact: true }).fill('DigiKey');
  await dialog.getByRole('textbox', { name: 'Supplier part number', exact: true }).fill(supplierPartNumber);
  await dialog.getByRole('textbox', { name: 'Ordering unit', exact: true }).fill('piece');
  await dialog.getByRole('textbox', { name: 'Units per order', exact: true }).fill('1');

  return dialog;
}

export async function ownOnePico(page: Page) {
  await picoRow(page).getByRole('button').first().click();

  const count = page.getByRole('textbox', { name: 'On hand', exact: true });

  await count.fill('1');
  await count.press('Enter');
  await page.getByText('Bill of materials', { exact: true }).click();
  await expect.poll(() => picoRow(page).innerText()).toContain('1 on hand');
}

export async function downloadPurchasingCsv(page: Page) {
  await page.getByRole('button', { name: 'Export bill of materials', exact: true }).click();

  const delivered = page.waitForEvent('download');

  await page.getByRole('menuitem', { name: 'CSV Spreadsheet', exact: true }).click();

  const file = await delivered;

  expect(file.suggestedFilename()).toBe('purchasing-arm-bom.csv');
  expect(await file.failure()).toBeNull();

  return parseBomCsv(await readFile((await file.path())!, 'utf8'));
}
