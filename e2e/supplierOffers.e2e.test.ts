import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { openApp } from './harness';
import { openPurchasingRobot, picoKey } from './bomPurchasingSteps';
import { parseBomCsv } from './bomCsv';

it('imports, confirms and retains selected supplier evidence through a real purchasing download', async () => {
  const app = await openApp();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-offers-e2e-'));

  try {
    const { page } = app;

    await page.route('**/api/bridge/purchases', (route) => route.fulfill({ json: listPurchases(dir) }));
    await page.route('**/api/bridge/purchase-save', (route) =>
      route.fulfill({ json: savePurchase(dir, route.request().postDataJSON()) }),
    );
    await openPurchasingRobot(page);
    await page.getByRole('button', { name: 'Export bill of materials', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Supplier Offers', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Supplier offers', exact: true });

    await dialog.getByRole('textbox', { name: 'Destination', exact: true }).fill('US-CA');
    await dialog.getByLabel('Required arrival date', { exact: true }).fill('2026-12-01');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'quotes.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Manufacturer,Manufacturer Part Number,Supplier,Supplier Part Number,Ordering Unit,Units per Order,Quantity Breaks,Available Orders,Currency,Destination,Observed At,Expires At,Quoted Arrival Earliest,Quoted Arrival Latest,Source Reference\nRaspberry Pi,SC1631,Shop A,00012,pack,2,1:12,10,USD,US-CA,2026-11-20T12:00:00Z,,2026-11-23,2026-11-25,quote-a\nRaspberry Pi,SC1631,Shop B,00013,pack,2,1:10,10,USD,US-CA,2026-11-20T12:00:00Z,,2026-11-23,2026-11-24,quote-b\n',
      ),
    });
    await dialog.getByRole('button', { name: 'Confirm Match and Packaging', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Select Shop A 00012', exact: true }).waitFor();
    await dialog
      .getByRole('button', { name: 'Select Shop A 00012', exact: true })
      .locator('../..')
      .getByText('Select an offer', { exact: true })
      .waitFor();
    await dialog.getByRole('button', { name: 'Confirm Match and Packaging', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Select Shop B 00013', exact: true }).click();

    const delivered = page.waitForEvent('download');

    await dialog.getByRole('button', { name: 'Export Purchasing Plan', exact: true }).click();

    const file = await delivered;
    const row = parseBomCsv(await readFile((await file.path())!, 'utf8')).find(
      (item) => item['Customer Reference'] === picoKey,
    );

    expect(await file.failure()).toBeNull();
    expect(row).toMatchObject({
      'Remaining Units': '3',
      'Supplier Order Qty': '2',
      'Units per Order': '2',
      Destination: 'US-CA',
      'Quoted Arrival Latest': '2026-11-24',
      'Observed At': '2026-11-20T12:00:00Z',
      'Line Total': '20',
    });
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await openPurchasingRobot(page);
    await page.getByRole('button', { name: 'Export bill of materials', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Supplier Offers', exact: true }).click();
    await expect
      .poll(() => page.getByRole('button', { name: 'Select Shop B 00013', exact: true }).getAttribute('aria-pressed'))
      .toBe('true');
    await dialog.getByRole('button', { name: 'Edit Match', exact: true }).nth(1).click();
    await dialog.getByRole('textbox', { name: 'Units per order', exact: true }).fill('4');
    await dialog.getByRole('button', { name: 'Confirm Match and Packaging', exact: true }).click();
    await dialog.getByRole('button', { name: 'Edit Match', exact: true }).nth(1).click();
    await expect
      .poll(() => dialog.getByRole('textbox', { name: 'Units per order', exact: true }).inputValue())
      .toBe('4');
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
