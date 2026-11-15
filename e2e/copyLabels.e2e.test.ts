import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await app.page.route('**/api/bridge/print-save-printers', (route) =>
    route.fulfill({ json: (route.request().postDataJSON() as { arg: unknown }).arg }),
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('visible captions as control names', () => {
  it('keeps Build and printer settings names', async () => {
    await app.page.keyboard.press('Meta+,');

    const settings = app.page.getByRole('dialog', { name: 'Settings' });
    const navigation = settings.getByRole('navigation');

    await navigation.getByRole('button', { name: 'Build', exact: true }).click();
    expect(await settings.getByRole('combobox', { name: 'Currency', exact: true }).count()).toBe(1);
    expect(await settings.getByRole('switch', { name: 'Have the agent fix new blockers', exact: true }).count()).toBe(
      1,
    );
    expect(await settings.getByRole('switch', { name: 'Update automatically', exact: true }).count()).toBe(1);
    await navigation.getByRole('button', { name: 'Printers', exact: true }).click();
    await settings.getByRole('button', { name: 'Add Printer', exact: true }).click();
    await settings.getByRole('textbox', { name: 'Name', exact: true }).waitFor({ state: 'visible' });
    expect(await settings.getByRole('textbox', { name: 'Name', exact: true }).count()).toBe(1);

    for (const name of ['Model', 'Nozzle', 'Send prints with'])
      expect(await settings.getByRole('combobox', { name, exact: true }).count()).toBe(1);

    await app.page.keyboard.press('Escape');
    await settings.waitFor({ state: 'hidden' });
    expect(app.errors).toEqual([]);
  });
});
