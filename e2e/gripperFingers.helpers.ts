import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { LAYOUT } from '../src/design-system/theme';
import { shown } from './harness';

export async function assertFingerParameterLayout(page: Page) {
  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));

  const name = page.locator(shown('input[aria-label="Rename finger_mount_spacing"]'));

  await name.scrollIntoViewIfNeeded();

  const bounds = await name.evaluate((element) => {
    const name = element as HTMLInputElement;
    const row = name.closest('.grid')!;
    const value = row.querySelector<HTMLInputElement>('input[aria-label="finger_mount_spacing"]')!;
    const unit = row.querySelector<HTMLSelectElement>('select')!;
    const textBounds = (input: HTMLInputElement | HTMLSelectElement) => {
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        textRight: box.left + parseFloat(style.paddingLeft) + context.measureText(input.value).width,
        contentRight: box.right - parseFloat(style.paddingRight),
      };
    };

    return { name: textBounds(name), value: textBounds(value), unit: textBounds(unit) };
  });

  expect(bounds.name.textRight).toBeLessThanOrEqual(bounds.name.contentRight);
  expect(bounds.name.bottom).toBeLessThanOrEqual(bounds.value.top - 4);
  expect(bounds.value.textRight).toBeLessThanOrEqual(bounds.value.contentRight);
  expect(bounds.value.right).toBeLessThanOrEqual(bounds.unit.left - 4);
  expect(bounds.unit.textRight).toBeLessThanOrEqual(bounds.unit.contentRight);
  expect([bounds.name.height, bounds.value.height, bounds.unit.height]).toEqual([32, 32, 32]);
}
