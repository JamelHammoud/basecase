import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('print layout', () => {
  it('counts the plates in the Build tab and lays them out in Print mode', async () => {
    await app.page.keyboard.press('a');
    await app.page.getByRole('button', { name: /^Cube/ }).first().click();
    expect(await partCount(app.page)).toBe(1);

    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const printing = app.page.locator(visible('section'), { hasText: /^Printing/ }).first();

    await expect
      .poll(() => printing.textContent(), { timeout: 20000 })
      .toMatch(/^Printing1 plate≈ .*minLay Out Plates$/);
    expect(await app.page.locator(visible('select[aria-label="Printer"]')).count()).toBe(0);

    await printing.getByRole('button', { name: 'Lay Out Plates' }).click();
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('select[aria-label="Printer"]')).count()).toBe(1);
    expect(await app.page.locator(visible('h3'), { hasText: /^Plate 1$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('button[aria-expanded="false"]'), { hasText: /^Parts/ }).textContent()).toBe(
      'Parts1',
    );
    expect(await app.page.getByRole('button', { name: /^Send Plate/ }).count()).toBe(0);

    await app.page.locator(visible('button'), { hasText: /^Add Printer$/ }).click();
    await expect
      .poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings] h3')).textContent())
      .toBe('Printers');
    await app.page
      .locator('[role=dialog][aria-label=Settings]')
      .getByRole('button', { name: /^Close/ })
      .click();
    await expect.poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings]')).count()).toBe(0);

    await app.page.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(0);
  });

  it('opens the plates with ⌘P, shows the Print panel, and closes with Esc', async () => {
    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);
    await expect.poll(() => app.page.locator(visible('canvas')).count()).toBeGreaterThan(0);
    await expect.poll(() => app.page.locator(visible('h3'), { hasText: /^Plate 1$/ }).count()).toBe(1);
    expect(await app.page.locator(visible('h3'), { hasText: /^Plates$/ }).count()).toBe(0);
    expect(await app.page.getByRole('button', { name: 'Close plates' }).count()).toBe(0);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('asks the backend for nothing it cannot answer', () => {
    expect(
      app.posts.filter((p) => p.route.startsWith('print-') && !/status|printers|last-slice/.test(p.route)),
    ).toEqual([]);
  });
});

describe('a Prusa printer', () => {
  it('lays out plates on the CORE One’s bed once it’s added in Settings ▸ Printers', async () => {
    await app.page.route('**/api/bridge/print-save-printers', (route) =>
      route.fulfill({ json: (route.request().postDataJSON() as { arg: unknown }).arg }),
    );
    await app.page.keyboard.press('Meta+,');

    const settings = app.page.getByRole('dialog', { name: 'Settings' });

    await settings.getByRole('navigation').getByRole('button', { name: 'Printers' }).click();
    await settings.getByRole('button', { name: 'Add Printer' }).click();
    await settings.locator('select[aria-label="Model"]').selectOption({ label: 'Prusa CORE One' });
    await expect.poll(() => settings.getByText('Prusa CORE One, 0.4 mm nozzle, Export only').count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => settings.count()).toBe(0);

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+p');
    await expect.poll(() => app.page.locator(visible('h2'), { hasText: /^Print$/ }).count()).toBe(1);

    const printState = () =>
      app.page.evaluate(() =>
        (
          window as unknown as {
            __studio: { printState: () => { printer: string; bed: { width: number; depth: number; height: number } } };
          }
        ).__studio.printState(),
      );

    await expect
      .poll(async () => {
        const { printer, bed } = await printState();

        return [printer, bed?.width, bed?.depth, bed?.height];
      })
      .toEqual(['prusa-core-one', 250, 220, 270]);

    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
});
