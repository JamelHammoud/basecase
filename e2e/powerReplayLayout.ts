import { expect } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { LAYOUT } from '../src/design-system/theme';
import { shown } from './harness';

export async function assertReplayBuildLayout(page: Page) {
  await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));

  const row = page.locator(shown('[data-check="Electrical connections"]'));

  await row.getByRole('button', { name: /^Electrical connections/ }).click();

  const order = await row.evaluate((element) => {
    const inspection = [...element.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inspect Current',
    )!;
    const findings = element.querySelector('ul')!;
    const text = document.createRange();

    text.selectNodeContents(inspection.querySelector('span')!);

    const bounds = text.getBoundingClientRect();
    const button = inspection.getBoundingClientRect();

    return {
      afterFindings: !!(findings.compareDocumentPosition(inspection) & Node.DOCUMENT_POSITION_FOLLOWING),
      textLeft: bounds.left,
      textRight: bounds.right,
      left: button.left,
      right: button.right,
      panelRight: element.getBoundingClientRect().right,
    };
  });

  expect(order.afterFindings).toBe(true);
  expect(order.textLeft).toBeGreaterThanOrEqual(order.left);
  expect(order.textRight).toBeLessThanOrEqual(order.right);
  expect(order.right).toBeLessThanOrEqual(order.panelRight);
  await row.getByRole('button', { name: /^Electrical connections/ }).click();
}

export async function assertReplayFields(dialog: Locator) {
  const fields = await dialog.locator('fieldset input').evaluateAll((elements) =>
    elements.map((element) => {
      const input = element as HTMLInputElement;
      const row = input.parentElement!.parentElement!;
      const text = document.createRange();

      text.selectNodeContents(row.querySelector('span')!);

      const label = text.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;

      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      return {
        labelWidth: label.width,
        rowWidth: row.getBoundingClientRect().width,
        labelBottom: label.bottom,
        fieldTop: field.top,
        height: field.height,
        valueWidth: input.type === 'number' ? context.measureText(input.value).width : 0,
        available: field.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      };
    }),
  );

  expect(fields.length).toBeGreaterThan(10);

  for (const field of fields) {
    expect(field.labelWidth).toBeLessThanOrEqual(field.rowWidth);
    expect(field.labelBottom).toBeLessThanOrEqual(field.fieldTop);
    expect(field.valueWidth).toBeLessThan(field.available);
    expect(field.height).toBeGreaterThanOrEqual(32);
  }
}

export async function assertReplayResults(dialog: Locator) {
  const time = dialog.getByRole('slider', { name: 'Time', exact: true });

  await time.focus();
  await time.press('Home');
  await time.press('ArrowRight');
  expect(await dialog.locator('[data-replay-selection]').getAttribute('data-replay-time')).toBe('0.026');
  expect(await dialog.getByText(/ V at 0\.026 s$/).count()).toBe(1);

  const clipped = await dialog.locator('button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const label = button.querySelector('span');

        if (!label || !button.textContent?.includes(' A / ')) return false;

        const range = document.createRange();

        range.selectNodeContents(label);

        const text = range.getBoundingClientRect();
        const bounds = button.getBoundingClientRect();

        return text.left < bounds.left || text.right > bounds.right || label.scrollWidth > label.clientWidth;
      })
      .map((button) => button.textContent),
  );

  expect(clipped).toEqual([]);
}
