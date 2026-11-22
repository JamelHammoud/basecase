import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp } from './bodyExperimentHarness';
import { openPlayTab, shown, type App } from './harness';
import type { BodyMotionStudio } from './bodyMotionHarness';
import { narrowBodyMotionPanel, expectBodyMotionLayout } from './bodyMotionLayout';

let app: App;

beforeAll(async () => {
  app = await openBodyExperimentApp();
  await narrowBodyMotionPanel(app.page);
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
    await expectBodyMotionLayout(page);
    await page.getByRole('button', { name: 'Method', exact: true }).press('Enter');
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();
    await expectBodyMotionLayout(page);

    const runButton = page.getByRole('button', { name: 'Run', exact: true });

    await expect.poll(() => runButton.isEnabled()).toBe(true);
    await runButton.press('Enter');
    await page.locator('[data-experiment-completion="completed"]').waitFor({ state: 'attached' });
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();

    const id = await page.getByRole('combobox', { name: 'Try' }).inputValue();

    expect(id).not.toBe('body-experiment-source');
    await page.getByRole('button', { name: 'Method', exact: true }).press('Enter');
    expect(await page.getByText('Observations:', { exact: false }).textContent()).toMatch(/\d/);
    await expectBodyMotionLayout(page);
    expect(
      await page
        .getByRole('dialog', { name: 'Analyze Try' })
        .getByRole('button', { name: 'Fit Body', exact: true })
        .isDisabled(),
    ).toBe(true);
    expect(
      await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations()),
    ).toEqual(before);
    await page.keyboard.press('Escape');
    await page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
    await page.locator(shown('[data-testid="library-tries"] button')).first().click();
    await page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`)).click();
    await page.locator('[data-testid="case-run-area"]').getByRole('button', { name: 'Done', exact: true }).click();
    await openPlayTab(page, 'Operate');
    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption(id);
    await page.locator('[data-experiment-completion="completed"]').waitFor({ state: 'attached' });
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();
    await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.editBodyEvidenceSource());
    await page.getByText('Out of date', { exact: true }).waitFor();
    expect(
      await page
        .getByRole('dialog', { name: 'Analyze Try' })
        .getByRole('button', { name: 'Fit Body', exact: true })
        .isDisabled(),
    ).toBe(true);
    await page.getByRole('button', { name: 'Method', exact: true }).press('Enter');
    await expectBodyMotionLayout(page);
    expect(app.errors).toEqual([]);
  },
);
