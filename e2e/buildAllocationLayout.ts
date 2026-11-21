import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';

export async function narrowBuildPanel(page: Page) {
  const resizer = page
    .locator('aside')
    .filter({ has: page.getByRole('tab', { name: /Build$/ }) })
    .getByRole('separator');
  const edge = (await resizer.boundingBox())!;

  await page.mouse.move(edge.x + edge.width / 2, edge.y + 200);
  await page.mouse.down();
  await page.mouse.move(edge.x + 60, edge.y + 200);
  await page.mouse.up();
  await expect.poll(() => resizer.getAttribute('aria-valuenow')).toBe('290');
}

export async function allocationQuantityBounds(row: Locator) {
  const input = row.getByRole('textbox', { name: 'Quantity', exact: true });

  await input.scrollIntoViewIfNeeded();

  const bounds = await input.evaluate((element) => {
    const field = element as HTMLInputElement;
    const owner = field.closest('[data-allocation-key]')!;
    const container = owner.getBoundingClientRect();
    const value = field.getBoundingClientRect();
    const style = getComputedStyle(field);
    const context = document.createElement('canvas').getContext('2d')!;

    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const buttons = [...owner.querySelectorAll('button')].map((button) => {
      const range = document.createRange();

      range.selectNodeContents(button);

      const box = button.getBoundingClientRect();
      const text = range.getBoundingClientRect();

      return { left: box.left, right: box.right, textLeft: text.left, textRight: text.right, height: box.height };
    });

    return {
      left: container.left,
      right: container.right,
      valueLeft: value.left,
      valueRight: value.right,
      textRight: value.left + parseFloat(style.paddingLeft) + context.measureText(field.value).width,
      contentRight: value.right - parseFloat(style.paddingRight),
      height: value.height,
      buttons,
    };
  });

  expect(bounds.height).toBe(32);
  expect(bounds.valueLeft).toBeGreaterThanOrEqual(bounds.left);
  expect(bounds.textRight).toBeLessThanOrEqual(bounds.contentRight);

  let previous = bounds.valueRight;

  for (const button of bounds.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(previous + 4);
    expect(button.textLeft).toBeGreaterThanOrEqual(button.left);
    expect(button.textRight).toBeLessThanOrEqual(button.right);
    expect(button.right).toBeLessThanOrEqual(bounds.right);
    expect(button.height).toBe(32);
    previous = button.right;
  }
}

export async function allocationTextBounds(text: Locator) {
  await text.scrollIntoViewIfNeeded();

  const bounds = await text.evaluate((element) => {
    const range = document.createRange();
    const parent = element.closest('section')!.getBoundingClientRect();

    range.selectNodeContents(element);

    return {
      left: parent.left,
      right: parent.right,
      lines: [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right })),
    };
  });

  expect(bounds.lines.length).toBeGreaterThan(0);

  for (const line of bounds.lines) {
    expect(line.left).toBeGreaterThanOrEqual(bounds.left);
    expect(line.right).toBeLessThanOrEqual(bounds.right);
  }
}
