import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { buildCheckPage } from './buildCheckFixtures';
import { openRover, type Studio } from './boardFixture';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await openRover(app.page);
});

afterAll(async () => {
  await app?.close();
});

it('locks a generated board placement with keyboard undo and redo', async () => {
  const { page } = app;

  await page
    .locator('section')
    .filter({ has: page.getByRole('button', { name: 'B3B-EH-A', exact: true }) })
    .getByRole('switch', { name: 'Locked', exact: true })
    .click();

  const original = await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord());

  expect(original.project.electronicsBoard?.placements.find((item) => item.id === 'connector_pan')?.locked).toBe(true);

  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(
      async () =>
        (
          await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())
        ).project.electronicsBoard?.placements.find((item) => item.id === 'connector_pan')?.locked,
    )
    .toBe(false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (window as unknown as Studio).__studio.sceneRecord())).project.electronicsBoard,
    )
    .toEqual(original.project.electronicsBoard);
  expect(app.errors).toEqual([]);
});

it('reports an outline shrink as a mechanical board blocker', async () => {
  await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const edit = app.page.getByRole('button', { name: 'Edit Board', exact: true });

  expect(await edit.textContent()).toBe('Edit Board');
  await edit.click();
  await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).waitFor();
  await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('5');
  await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
  await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const row = buildCheckPage(() => app.page).checkRow('Board fit');

  await expect.poll(() => row.getAttribute('data-status')).toBe('fail');
});
