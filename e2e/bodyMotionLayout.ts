import { expect } from 'vitest';
import type { Page } from 'playwright-core';

export async function narrowBodyMotionPanel(page: Page) {
  const handle = page.getByRole('separator').filter({ visible: true }).and(page.locator('[aria-valuemin="230"]'));
  const bounds = (await handle.boundingBox())!;
  const width = Number(await handle.getAttribute('aria-valuenow'));

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - (width - 230), bounds.y + bounds.height / 2);
  await page.mouse.up();
  expect(await handle.getAttribute('aria-valuenow')).toBe('230');
}

export async function expectBodyMotionLayout(page: Page) {
  const violations = await page.getByRole('dialog', { name: 'Analyze Try' }).evaluate((dialog) => {
    const bounds = dialog.getBoundingClientRect();
    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const texts: Array<{ text: string; rect: DOMRect; visible: boolean }> = [];
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement!;

      if (node.textContent?.trim() && parent.getClientRects().length && !parent.closest('select, option')) {
        range.selectNodeContents(node);

        const viewport = parent.closest('.overflow-y-auto')?.getBoundingClientRect() ?? bounds;

        texts.push(
          ...[...range.getClientRects()].map((rect) => ({
            text: node!.textContent!,
            rect,
            visible: rect.top >= viewport.top && rect.bottom <= viewport.bottom,
          })),
        );
      }

      node = walker.nextNode();
    }

    const outside = texts.filter(({ rect }) => rect.left < bounds.left || rect.right > bounds.right);
    const visible = texts.filter((text) => text.visible);
    const overlap = visible.filter(({ rect }, index) =>
      visible
        .slice(0, index)
        .some(
          ({ rect: other }) =>
            rect.left < other.right - 1 &&
            rect.right > other.left + 1 &&
            rect.top < other.bottom - 1 &&
            rect.bottom > other.top + 1,
        ),
    );
    const labels = [...dialog.querySelectorAll('[data-body-parameter] dt label')].filter((label) => {
      const text = label.querySelector('span')!;
      const button = label.querySelector('button')!.getBoundingClientRect();

      range.selectNodeContents(text);

      return [...range.getClientRects()].some((rect) => rect.right > button.left - 1);
    });

    return [...outside, ...overlap].map(({ text }) => text).concat(labels.map((label) => label.textContent!));
  });

  expect(violations).toEqual([]);
}
