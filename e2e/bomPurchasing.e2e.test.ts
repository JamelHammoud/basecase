import { expect, it } from 'vitest';
import { openApp } from './harness';
import {
  downloadPurchasingCsv,
  editPicoIdentity,
  openPurchasingRobot,
  ownOnePico,
  picoKey,
} from './bomPurchasingSteps';

it('downloads exact supplier quantities after editing the listing and stock through Build', async () => {
  const app = await openApp();

  try {
    const { page } = app;

    await openPurchasingRobot(page);

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
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
