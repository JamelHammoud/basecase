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

  it('keeps the print settings and selected part names', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    await app.page.keyboard.press('Meta+p');
    await app.page.getByTestId('print-printer').waitFor({ state: 'visible' });

    for (const name of ['Printer', 'Quality', 'Material'])
      expect(await app.page.getByRole('combobox', { name, exact: true }).count()).toBe(1);

    expect(await app.page.getByRole('textbox', { name: 'Infill', exact: true }).count()).toBe(1);
    await app.page.getByRole('button', { name: /^Parts/ }).click();
    await app.page.getByRole('button', { name: /^Cube/ }).filter({ visible: true }).click();
    expect(await app.page.getByRole('textbox', { name: 'Copies', exact: true }).count()).toBe(1);
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
});
