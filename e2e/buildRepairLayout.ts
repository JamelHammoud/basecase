import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { selectedBuild } from './buildRepairScene';

export async function repairControlBounds(page: Page) {
  await expect.poll(async () => (await selectedBuild(page)).repairs?.length).toBe(1);
  expect(await page.getByRole('button', { name: 'Resume Repair', exact: true }).count()).toBe(0);

  const progress = page.locator('[data-repair-source]');

  await page.locator('[data-repair-allocations]').waitFor();
  await progress.scrollIntoViewIfNeeded();

  const bounds = await progress.evaluate((element) => {
    const owner = element.getBoundingClientRect();
    const controls = [...element.querySelectorAll('button, select')].map((control) => {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const context = document.createElement('canvas').getContext('2d')!;
      const text = control instanceof HTMLSelectElement ? control.selectedOptions[0].text : control.textContent!;

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        text: context.measureText(text).width,
        width: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      };
    });
    const hashes = element.querySelector('.break-all')!;
    const range = document.createRange();

    range.selectNodeContents(hashes);

    return {
      left: owner.left,
      right: owner.right,
      controls,
      lines: [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right })),
      allocations: element
        .closest('section')!
        .parentElement!.querySelector('[data-allocation-part]')!
        .getBoundingClientRect().top,
    };
  });

  expect(bounds.controls.length).toBeGreaterThan(1);

  for (const [index, control] of bounds.controls.entries()) {
    expect(control.left).toBeGreaterThanOrEqual(bounds.left);
    expect(control.right).toBeLessThanOrEqual(bounds.right);
    expect(control.height).toBeGreaterThanOrEqual(32);
    expect(control.text).toBeLessThanOrEqual(control.width);
    expect(control.bottom).toBeLessThanOrEqual(bounds.allocations);

    if (index) expect(control.top).toBeGreaterThanOrEqual(bounds.controls[index - 1].bottom);
  }

  for (const line of bounds.lines) {
    expect(line.left).toBeGreaterThanOrEqual(bounds.left);
    expect(line.right).toBeLessThanOrEqual(bounds.right);
  }

  expect(await page.getByRole('button', { name: 'Link Fleet Robot', exact: true }).count()).toBe(0);
  expect(await page.getByRole('button', { name: 'Fleet', exact: true }).getAttribute('aria-expanded')).toBe('false');
}
