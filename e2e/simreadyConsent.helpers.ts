import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';
import { LAYOUT } from '../src/design-system/theme';
import { shown } from './harness';

export async function narrowTextureInspector(page: Page) {
  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));
}

export async function assertTextureActionLayout(button: Locator) {
  await button.scrollIntoViewIfNeeded();

  const bounds = await button.evaluate((element) => {
    const label = element.lastElementChild!;
    const range = document.createRange();

    range.selectNodeContents(label);

    const text = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const icon = element.childElementCount > 1 ? element.firstElementChild!.getBoundingClientRect() : null;
    const section = element.closest('section')!;
    const inspector = section.parentElement!;
    const headings = [...inspector.querySelectorAll('section h3')].map((heading) => heading.textContent);

    return {
      textLeft: text.left,
      textRight: text.right,
      left: box.left,
      right: box.right,
      height: box.height,
      iconRight: icon?.right,
      headings,
    };
  });

  expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left + 12);
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.right - 12);
  expect(bounds.height).toBeGreaterThanOrEqual(32);

  if (bounds.iconRight !== undefined) expect(bounds.iconRight).toBeLessThanOrEqual(bounds.textLeft - 4);

  for (const heading of ['Size', 'Position', 'Rotation', 'Appearance']) {
    expect(bounds.headings.indexOf(heading)).toBeGreaterThanOrEqual(0);
    expect(bounds.headings.indexOf(heading)).toBeLessThan(bounds.headings.indexOf('SimReady'));
  }
}

export async function assertTextureEditingFields(page: Page) {
  const fields = page
    .locator(shown('section'))
    .filter({ has: page.getByRole('heading', { name: /^(Size|Position|Rotation)$/ }) });
  const bounds = await fields.locator('input').evaluateAll((inputs) =>
    inputs.map((element) => {
      const input = element as HTMLInputElement;
      const spans = [...input.parentElement!.querySelectorAll('span')];
      const label = spans.find((span) => span.childElementCount === 0)!;
      const unit = spans.at(-1)!;
      const range = document.createRange();

      range.selectNodeContents(label);

      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      return {
        labelRight: range.getBoundingClientRect().right,
        valueLeft: box.left + parseFloat(style.paddingLeft),
        valueRight: box.left + parseFloat(style.paddingLeft) + context.measureText(input.value).width,
        unitLeft: unit.getBoundingClientRect().left,
        height: box.height,
      };
    }),
  );

  expect(bounds).toHaveLength(9);

  for (const field of bounds) {
    expect(field.labelRight).toBeLessThanOrEqual(field.valueLeft - 4);
    expect(field.valueRight).toBeLessThanOrEqual(field.unitLeft - 4);
    expect(field.height).toBeGreaterThanOrEqual(32);
  }
}
