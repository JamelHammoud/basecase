import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp, openRetainedBodyExperiment, runSelectedBodyExperiment } from './bodyExperimentHarness';
import { type App } from './harness';
import type { BodyMotionStudio } from './bodyMotionHarness';
import { narrowBodyMotionPanel, expectBodyMotionLayout } from './bodyMotionLayout';

let app: App;

beforeAll(async () => {
  app = await openBodyExperimentApp({ recommended: true });
  await narrowBodyMotionPanel(app.page);
});
afterAll(async () => {
  await app?.close();
});

it(
  'runs a retained recommendation and binds its measured recording to the original prediction',
  { retry: 0, timeout: 15000 },
  async () => {
    const { page } = app;
    const before = await page.evaluate(() =>
      (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyCalibrations(),
    );

    await openRetainedBodyExperiment(app);
    await expectBodyMotionLayout(page);
    await page.getByRole('button', { name: 'Method', exact: true }).press('Enter');
    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();
    await expectBodyMotionLayout(page);

    const id = await runSelectedBodyExperiment(app);

    await page.getByText('This emulator doesn’t model body mass, payload or floor contact.', { exact: true }).waitFor();
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
    expect(await page.getByRole('dialog', { name: 'Analyze Try' }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  },
);
