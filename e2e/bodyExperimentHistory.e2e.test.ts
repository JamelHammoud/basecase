import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp, openRetainedBodyExperiment, runSelectedBodyExperiment } from './bodyExperimentHarness';
import { openPlayTab, shown, type App } from './harness';
import type { BodyMotionStudio } from './bodyMotionHarness';
import { narrowBodyMotionPanel, expectBodyMotionLayout } from './bodyMotionLayout';

let app: App;
let id: string;

beforeAll(async () => {
  app = await openBodyExperimentApp({ recommended: true });
  await narrowBodyMotionPanel(app.page);
  await openRetainedBodyExperiment(app);
  id = await runSelectedBodyExperiment(app);
  await app.page.keyboard.press('Escape');
});
afterAll(async () => {
  await app?.close();
});

it(
  'reopens measured motion through Library and preserves bound analysis after a physical edit',
  { retry: 0, timeout: 15000 },
  async () => {
    const { page } = app;

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
