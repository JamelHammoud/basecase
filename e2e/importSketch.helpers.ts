import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { LAYOUT } from '../src/design-system/theme';
import { shown } from './harness';

export async function assertRecoveryThicknessLayout(page: Page) {
  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));

  const input = page.locator(shown('input[aria-label="Thickness"]'));

  await input.fill('250');

  const bounds = await input.evaluate((element) => {
    const field = element as HTMLInputElement;
    const spans = [...field.parentElement!.querySelectorAll('span')];
    const label = spans.find((span) => span.textContent === 'T')!;
    const unit = spans.find((span) => span.textContent === 'mm')!;
    const range = document.createRange();

    range.selectNodeContents(label);

    const value = field.getBoundingClientRect();
    const style = getComputedStyle(field);
    const context = document.createElement('canvas').getContext('2d')!;

    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    return {
      labelRight: range.getBoundingClientRect().right,
      valueLeft: value.left + parseFloat(style.paddingLeft),
      valueRight: value.left + parseFloat(style.paddingLeft) + context.measureText(field.value).width,
      unitLeft: unit.getBoundingClientRect().left,
      height: value.height,
    };
  });

  expect(bounds.labelRight).toBeLessThanOrEqual(bounds.valueLeft - 4);
  expect(bounds.valueRight).toBeLessThanOrEqual(bounds.unitLeft - 4);
  expect(bounds.height).toBe(32);
  await input.press('Escape');
  expect(await input.inputValue()).toBe('6');
}

interface RecoveryWorkerWindow {
  recoveryWorkerState: { started: boolean; terminated: boolean };
  originalRecoveryWorker: typeof Worker;
}

export async function holdRecoveryWorker(page: Page) {
  await page.evaluate(() => {
    const state = { started: false, terminated: false };
    const OriginalWorker = window.Worker;

    (window as unknown as RecoveryWorkerWindow).recoveryWorkerState = state;
    (window as unknown as RecoveryWorkerWindow).originalRecoveryWorker = OriginalWorker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);

        if (!String(url).includes('recovery.worker')) return;

        state.started = true;
        this.postMessage = () => {};
        this.terminate = () => {
          state.terminated = true;
          super.terminate();
        };
      }
    };
  });

  return {
    started: () => page.evaluate(() => (window as unknown as RecoveryWorkerWindow).recoveryWorkerState.started),
    terminated: () => page.evaluate(() => (window as unknown as RecoveryWorkerWindow).recoveryWorkerState.terminated),
    restore: () =>
      page.evaluate(() => {
        window.Worker = (window as unknown as RecoveryWorkerWindow).originalRecoveryWorker;
      }),
  };
}
