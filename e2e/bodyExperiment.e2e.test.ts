import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp } from './bodyExperimentHarness';
import { openPlayTab, shown, type App } from './harness';
import type { BodyMotionStudio } from './bodyMotionHarness';

let app: App;

beforeAll(async () => {
  app = await openBodyExperimentApp();
});
afterAll(async () => {
  await app?.close();
});

it(
  'runs a retained recommendation and opens its measured recording and bound analysis through Library',
  { retry: 0, timeout: 15000 },
  async () => {
    const { page } = app;
    const before = await page.evaluate(() =>
      (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations(),
    );

    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption('body-experiment-source');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.getByRole('dialog', { name: 'Analyze Try' }).getByRole('switch').first().click();
    await page.getByRole('button', { name: 'Preview Motion', exact: true }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.locator('[data-experiment-completion="completed"]').waitFor({ state: 'attached' });
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();

    const id = await page.getByRole('combobox', { name: 'Try' }).inputValue();

    expect(id).not.toBe('body-experiment-source');
    await page.getByRole('button', { name: 'Method', exact: true }).click();
    expect(await page.getByText('Observations:', { exact: false }).textContent()).toMatch(/\d/);
    await page.getByRole('button', { name: 'Fit Body', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations()),
    ).toEqual(before);
    await page.keyboard.press('Escape');
    await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await page.locator(shown('[data-testid="library-tries"] button')).first().click();
    await page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`)).click();
    await openPlayTab(page, 'Operate');
    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption(id);
    await page.locator('[data-experiment-completion="completed"]').waitFor({ state: 'attached' });
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();
    expect(app.errors).toEqual([]);
  },
);
