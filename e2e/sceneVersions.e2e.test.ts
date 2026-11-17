import { seedVersionProfile } from './sceneVersionProfile';
import { expect, inject, it } from 'vitest';
import type { Page } from 'playwright-core';
import { exposeTestHooks, launchChrome, partCount, shown } from './harness';
import type { ScenePart } from '../src/types/robotics';

const part = (id: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 10, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

async function command(page: Page, label: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Search commands').fill(label);
  await page.keyboard.press('Enter');
}

async function seed(page: Page) {
  await exposeTestHooks(page);
  await seedVersionProfile(page, inject('webUrl'));
  await page.goto(inject('webUrl'));
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
  await page.evaluate(
    (parts) => {
      const studio = (
        window as unknown as {
          __studio: { load: (record: { id: string; name: string; parts: ScenePart[] }) => void };
        }
      ).__studio;

      studio.load({ id: 'version-arm', name: 'Arm bracket', parts });
    },
    [part('bracket'), part('camera')],
  );
}

async function removeCamera(page: Page) {
  await page
    .locator(shown('canvas'))
    .first()
    .click({ position: { x: 30, y: 30 } });
  await page.evaluate(() => {
    (window as unknown as { __studio: { select: (ids: string[]) => void } }).__studio.select(['camera']);
  });
  await page.waitForFunction(() =>
    (window as unknown as { __studio: { selection: () => string[] } }).__studio.selection().includes('camera'),
  );
  await page.keyboard.press('Backspace');
  await expect.poll(() => partCount(page)).toBe(1);
}

it('saves and restores a named version through Scene History and retains it after reload', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage();

  try {
    await seed(page);
    await command(page, 'Scene History');
    await page.getByLabel('Version name').fill('Before camera edit');
    await page.getByRole('button', { name: 'Save Version', exact: true }).click();
    await page.getByRole('button', { name: 'Before camera edit', exact: true }).waitFor();
    await page
      .getByRole('dialog', { name: 'Scene history', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await removeCamera(page);
    await command(page, 'Scene History');
    await page.getByRole('button', { name: 'Before camera edit', exact: true }).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect.poll(() => partCount(page)).toBe(2);
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await expect.poll(() => partCount(page)).toBe(2);
    await command(page, 'Scene History');
    await page.getByRole('button', { name: 'Before camera edit', exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});
