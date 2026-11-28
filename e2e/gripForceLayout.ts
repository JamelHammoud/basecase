import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';
import { shown } from './harness';

export async function narrowCaseBuilder(page: Page) {
  const divider = page.locator(shown('[role="separator"][aria-valuemin="230"]'));
  const box = (await divider.boundingBox())!;
  const width = Number(await divider.getAttribute('aria-valuenow'));

  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - (width - 230), box.y + 200);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe('230');
}

export async function expectForceFieldReadable(builder: Locator) {
  const input = builder.getByLabel('Grip force ceiling');

  await input.scrollIntoViewIfNeeded();

  const bounds = await input.evaluate((element) => {
    const field = element as HTMLInputElement;
    const control = field.parentElement!;
    const row = control.parentElement!;
    const label = row.firstElementChild!;
    const unit = field.nextElementSibling!;
    const range = document.createRange();
    const style = getComputedStyle(field);
    const context = document.createElement('canvas').getContext('2d')!;

    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    range.selectNodeContents(label);

    const labelText = range.getBoundingClientRect().toJSON();

    range.selectNodeContents(unit);

    return {
      row: row.getBoundingClientRect().toJSON(),
      label: label.getBoundingClientRect().toJSON(),
      labelText,
      input: field.getBoundingClientRect().toJSON(),
      control: control.getBoundingClientRect().toJSON(),
      unit: range.getBoundingClientRect().toJSON(),
      valueWidth:
        context.measureText(field.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
    };
  });

  expect(bounds.labelText.left).toBeGreaterThanOrEqual(bounds.label.left);
  expect(bounds.labelText.right).toBeLessThanOrEqual(bounds.label.right);
  expect(bounds.labelText.bottom).toBeLessThanOrEqual(bounds.control.top);
  expect(bounds.control.left).toBeGreaterThanOrEqual(bounds.row.left);
  expect(bounds.control.right).toBeLessThanOrEqual(bounds.row.right);
  expect(bounds.valueWidth).toBeLessThanOrEqual(bounds.input.width);
  expect(bounds.input.right).toBeLessThanOrEqual(bounds.unit.left);
  expect(bounds.unit.right).toBeLessThanOrEqual(bounds.control.right);
  expect(bounds.control.height).toBe(32);

  const actions = await builder
    .locator('button')
    .filter({ hasText: /^(Cancel|Make Case)$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const range = document.createRange();

        range.selectNodeContents(button);

        return { box: button.getBoundingClientRect().toJSON(), text: range.getBoundingClientRect().toJSON() };
      }),
    );

  expect(actions).toHaveLength(2);
  expect(actions[0].box.right).toBeLessThanOrEqual(actions[1].box.left);

  for (const action of actions) {
    expect(action.text.left).toBeGreaterThanOrEqual(action.box.left);
    expect(action.text.right).toBeLessThanOrEqual(action.box.right);
    expect(action.box.left).toBeGreaterThanOrEqual(bounds.row.left);
    expect(action.box.right).toBeLessThanOrEqual(bounds.row.right);
  }
}
