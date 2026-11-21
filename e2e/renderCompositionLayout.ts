import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { shown } from './harness';

export async function narrowCompositionCanvas(page: Page) {
  await page.setViewportSize({ width: 1240, height: 720 });

  const divider = page.locator(shown('[role="separator"][aria-valuemin="290"]'));

  if (!(await divider.count())) await page.keyboard.press('ControlOrMeta+i');

  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - (620 - width), box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe('620');

  const bounds = await page.getByRole('button', { name: 'Render Image', exact: true }).evaluate((button) => {
    const canvas = button.closest('[data-canvas-card]')!.getBoundingClientRect();

    return [...button.closest('.glass')!.querySelectorAll('button')].map((control) => {
      const box = control.getBoundingClientRect();

      return { left: box.left - canvas.left, right: canvas.right - box.right, width: box.width, height: box.height };
    });
  });

  for (const control of bounds) {
    expect(control.left).toBeGreaterThanOrEqual(12);
    expect(control.right).toBeGreaterThanOrEqual(12);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
}
