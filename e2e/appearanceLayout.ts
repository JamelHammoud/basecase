import { expect } from 'vitest';
import type { Page } from 'playwright-core';

export const appearanceSection = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Appearance', exact: true }) })
    .filter({ visible: true });

export async function expectAppearanceReadable(page: Page) {
  const section = appearanceSection(page);
  const violations = await section.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const readings: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    const violations: string[] = [];
    const addText = (node: Node) => {
      const parent = node.parentElement!;

      if (!node.textContent?.trim() || !parent.getClientRects().length || parent.closest('select')) return;

      range.selectNodeContents(node);

      for (const rect of range.getClientRects()) {
        if (rect.left < bounds.left || rect.right > bounds.right) violations.push(node.textContent);

        readings.push(rect);
      }
    };
    const addInput = (field: Element) => {
      const input = field as HTMLInputElement | HTMLSelectElement;

      if (!input.getClientRects().length) return;

      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const value = input instanceof HTMLSelectElement ? (input.selectedOptions[0]?.text ?? '') : input.value;

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      const left = rect.left + parseFloat(style.paddingLeft);
      const right = left + context.measureText(value).width;

      if (right > rect.right - parseFloat(style.paddingRight) + 1) violations.push(value);

      readings.push({ left, right, top: rect.top + 8, bottom: rect.bottom - 8 });

      if (rect.height < 32 || rect.left < bounds.left || rect.right > bounds.right) violations.push(value);
    };
    let node = walker.nextNode();

    while (node) {
      addText(node);
      node = walker.nextNode();
    }

    root.querySelectorAll('input:not([type="file"]), select').forEach(addInput);
    readings.forEach((rect, index) => {
      const overlap = readings
        .slice(index + 1)
        .some(
          (other) =>
            rect.left < other.right - 1 &&
            rect.right > other.left + 1 &&
            rect.top < other.bottom - 1 &&
            rect.bottom > other.top + 1,
        );

      if (overlap) violations.push('overlap');
    });

    return violations;
  });

  expect(violations).toEqual([]);
}
