import { expect, it } from 'vitest';
import { openApp } from './harness';
import {
  downloadPurchasingCsv,
  editPicoIdentity,
  openPurchasingRobot,
  openPurchasingBuild,
  ownOnePico,
  picoKey,
} from './bomPurchasingSteps';

it('downloads exact supplier quantities through Build, then reloads purchases and corrects the listing', async () => {
  const app = await openApp();

  try {
    const { page } = app;

    const scene = await openPurchasingRobot(page);

    const dialog = await editPicoIdentity(page);

    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await ownOnePico(page);

    const first = (await downloadPurchasingCsv(page)).find((row) => row['Customer Reference'] === picoKey);

    expect(first).toMatchObject({
      'Qty Needed': '3',
      'On Hand': '1',
      'Remaining Units': '2',
      Manufacturer: 'Raspberry Pi',
      'Manufacturer Part Number': 'SC1631',
      Supplier: 'DigiKey',
      'Supplier Part Number': '2648-SC1631CT-ND',
      'Ordering Unit': 'piece',
      'Units per Order': '1',
      'Supplier Order Qty': '2',
    });
    await page.route('**/api/bridge/scenes', (route) =>
      route.fulfill({ json: [{ ...scene, updatedAt: '2026-11-16T00:00:00.000Z', partCount: scene.parts.length }] }),
    );
    await page.route(
      (url) => url.pathname === '/api/bridge/scene',
      (route) => route.fulfill({ json: scene }),
    );
    await page.reload();
    await openPurchasingBuild(page);
    expect((await downloadPurchasingCsv(page)).find((row) => row['Customer Reference'] === picoKey)).toEqual(first);

    const correction = await editPicoIdentity(page, '2648-SC1631TR-ND');

    await correction.getByRole('textbox', { name: 'Ordering unit', exact: true }).fill('reel');
    await correction.getByRole('textbox', { name: 'Units per order', exact: true }).fill('2400');
    await correction.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await downloadPurchasingCsv(page)).find((row) => row['Customer Reference'] === picoKey)).toMatchObject({
      'Supplier Part Number': '2648-SC1631TR-ND',
      'Remaining Units': '2',
      'Ordering Unit': 'reel',
      'Units per Order': '2400',
      'Supplier Order Qty': '1',
    });
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
