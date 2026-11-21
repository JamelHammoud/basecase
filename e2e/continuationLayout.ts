import { expect } from 'vitest';
import type { Page } from 'playwright-core';

export async function assertContinuationLayout(page: Page) {
  const timeline = page.getByTestId('try-timeline');
  const measured = await timeline.evaluate((root) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();

      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    };
    const controls = [...root.querySelectorAll('[data-testid^="timeline-"] button, select, input[type="range"]')];
    const text = [
      ...root.querySelectorAll('[data-testid="timeline-playback"] span, [data-testid="timeline-actions"] span'),
    ]
      .filter((element) => element.textContent?.trim())
      .map((element) => {
        const range = document.createRange();

        range.selectNodeContents(element);

        return { field: box(element), text: boxFromRange(range) };
      });
    const select = root.querySelector('select')!;
    const style = getComputedStyle(select);
    const context = document.createElement('canvas').getContext('2d')!;

    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    function boxFromRange(range: Range) {
      const rect = range.getBoundingClientRect();

      return { left: rect.left, right: rect.right };
    }

    return {
      root: box(root),
      controls: controls.map(box),
      text,
      selectText: context.measureText(select.selectedOptions[0].text).width,
      selectContent: box(select).width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      trackWidth: box(root.querySelector('input[type="range"]')!).width,
    };
  });

  expect(measured.root.left).toBeGreaterThanOrEqual(0);
  expect(measured.root.right).toBeLessThanOrEqual(1240);
  expect(measured.trackWidth).toBeGreaterThanOrEqual(40);
  expect(measured.selectText).toBeLessThanOrEqual(measured.selectContent);

  for (const control of measured.controls) {
    expect(control.left).toBeGreaterThanOrEqual(measured.root.left);
    expect(control.right).toBeLessThanOrEqual(measured.root.right);
  }

  for (const { field, text } of measured.text) {
    expect(text.left).toBeGreaterThanOrEqual(field.left - 0.5);
    expect(text.right).toBeLessThanOrEqual(field.right + 0.5);
  }

  for (const [index, control] of measured.controls.entries()) {
    for (const next of measured.controls.slice(index + 1)) {
      const overlap =
        Math.min(control.right, next.right) - Math.max(control.left, next.left) > 0.5 &&
        Math.min(control.bottom, next.bottom) - Math.max(control.top, next.top) > 0.5;

      expect(overlap).toBe(false);
    }
  }
}
