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
    expect(
      await app.page.locator(visible('button[aria-expanded="false"]'), { hasText: /^Printed parts/ }).textContent(),
    ).toBe('Printed parts1');

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
