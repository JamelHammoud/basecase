import { expect, it } from 'vitest';
import { openApp, shown } from './harness';
import { specToPart } from '../src/agent/agentScene';
import type { ScenePart } from '../src/types/robotics';

it('scrolls and searches all layers while retaining a rename draft outside the visible rows', async () => {
  const app = await openApp();
  const { page } = app;
  const parts = Array.from({ length: 1000 }, (_, index) =>
    specToPart({
      id: `plate-${index}`,
      name: `Plate ${index}`,
      shape: 'box',
      position: [(index % 40) * 30, Math.floor(index / 40) * 30, 0],
      size: [20, 20, 10],
    }),
  );

  try {
    await page.evaluate(
      (seed) =>
        (window as unknown as { __studio: { load: (scene: { parts: ScenePart[] }) => void } }).__studio.load({
          parts: seed,
        }),
      parts,
    );
    await page.getByRole('button', { name: 'Layers', exact: true }).click();

    const rows = page.locator(shown('[data-layer-row]'));
    const scroller = rows.first().locator('../..');

    await expect.poll(() => rows.count()).toBeLessThan(60);
    expect(await rows.first().getAttribute('aria-setsize')).toBe('1000');
    await scroller.hover();
    await page.mouse.wheel(0, 33000);
    await page.getByText('Plate 999', { exact: true }).waitFor();
    expect(await page.locator(shown('[data-layer-row="part:plate-999"]')).getAttribute('aria-posinset')).toBe('1000');
    await page.getByText('Plate 999', { exact: true }).dblclick();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Rear plate');
    await page.mouse.wheel(0, -33000);
    await page.getByText('Plate 0', { exact: true }).waitFor();
    expect(await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue()).toBe('Rear plate');
    expect(await rows.count()).toBeLessThan(60);
    await page.getByRole('textbox', { name: 'Name', exact: true }).press('Enter');
    await page.getByRole('textbox', { name: 'Search layers', exact: true }).fill('Rear plate');
    await page.getByText('Rear plate', { exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Search layers', exact: true }).fill('');
    await page.getByText('Rear plate', { exact: true }).first().waitFor({ state: 'visible' });
    expect(await rows.count()).toBeLessThan(60);
    await page
      .locator(shown('canvas'))
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(
      () =>
        (window as unknown as { __studio: { sceneRecord: () => { parts: unknown[] } } }).__studio.sceneRecord().parts
          .length === 0,
    );
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => rows.count()).toBeGreaterThan(0);
    await scroller.hover();
    await page.mouse.wheel(0, 33000);
    await page.getByText('Rear plate', { exact: true }).first().waitFor({ state: 'visible' });
    expect(await rows.count()).toBeLessThan(60);
  } finally {
    await app.close();
  }
});
