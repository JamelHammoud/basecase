import { expect } from 'vitest';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, shown } from './harness';
import { bodyExecutionScene, parkedBodyRun } from '../src/reality/bodyMotion.fixtures';
import type { BodyMotionStudio } from './bodyMotionHarness';

export async function openBodyExperimentApp(options: { second?: boolean; recommended?: boolean } = {}) {
  const app = await openApp();
  const { page } = app;

  await page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await page.evaluate(() => {
    const target = window as unknown as { __studio: BodyMotionStudio; __fakeRobotLink: unknown };

    target.__studio.attachRobot(target.__fakeRobotLink);
  });
  await page.evaluate((scene) => (window as unknown as { __studio: BodyMotionStudio }).__studio.load(scene), {
    ...bodyExecutionScene(),
    id: 'body-experiment-scene',
  });
  await openPlayTab(page, 'Operate');
  await page.getByRole('button', { name: 'Connect Emulated Robot', exact: true }).filter({ visible: true }).click();
  await climb();

  if (options.second) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Search commands').fill('Connect Emulated Robot');
    await page.getByPlaceholder('Search commands').press('Enter');
    await page.locator('[data-fleet-unit="robot-2"]').filter({ visible: true }).click();
    await climb();
    await page.locator('[data-fleet-unit="robot"]').filter({ visible: true }).click();
  }

  const model = await page.evaluate(() => (window as unknown as { __studio: BodyMotionStudio }).__studio.bodyModel());
  const run = parkedBodyRun(model);

  await page.evaluate(
    async ({ model, run, recommended }) => {
      await (window as unknown as { __studio: BodyMotionStudio }).__studio.seedBodyEvidence({
        model,
        run,
        id: 'body-experiment-source',
        recommended,
      });
    },
    { model, run, recommended: options.recommended },
  );

  return app;

  async function climb() {
    await page.locator(shown('[data-robot-rung="set_up"]')).first().click();
    await expect
      .poll(() => page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode'))
      .toBe('set_up');
    await page.locator(shown('[data-robot-rung="test"]')).first().click();
    await page.getByText('Motors running', { exact: true }).filter({ visible: true }).waitFor();
  }
}
