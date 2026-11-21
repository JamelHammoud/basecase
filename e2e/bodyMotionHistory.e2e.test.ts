import { afterAll, beforeAll, expect, it } from 'vitest';
import { openPlayTab, type App } from './harness';
import { attachBodyMotionRobot, openBodyMotionApp, type BodyMotionStudio as Studio } from './bodyMotionHarness';

let app: App;

beforeAll(async () => {
  ({ app } = await openBodyMotionApp(true));

  const record = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord());

  await app.page.reload();
  await app.page.waitForFunction(() => !!(window as unknown as { __studio?: Studio }).__studio);
  await attachBodyMotionRobot(app);
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    ...record,
    id: 'body-motion-scene',
  });
  await openPlayTab(app.page, 'Operate');
});

afterAll(async () => {
  await app?.close();
});

it(
  'reopens retained predictions after reload without searching and keeps them visible after a physical edit',
  { retry: 0, timeout: 15000 },
  async () => {
    await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await app.page.getByRole('combobox', { name: 'Try' }).selectOption('body-motion-arm');
    await app.page.locator('[data-testid="body-motion-preview"][data-ready="true"] canvas').waitFor();
    expect(
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyAnalysisMetrics().motion),
    ).toBeNull();
    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.editBodyEvidenceSource());
    await app.page.getByText('Out of date', { exact: true }).waitFor();
    expect(await app.page.getByRole('button', { name: 'Preview Motion', exact: true }).isDisabled()).toBe(true);
    expect(await app.page.locator('[data-testid="body-motion-preview"][data-ready="true"] canvas').count()).toBe(1);
    expect(
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bodyAnalysisMetrics().motion),
    ).toBeNull();
    expect(
      await app.page.evaluate(() => (window as unknown as { __bodyMotionCommands: number }).__bodyMotionCommands),
    ).toBe(0);
    await app.page.getByRole('slider', { name: 'Time', exact: true }).press('End');
    await expect
      .poll(() => app.page.locator('[data-testid="body-motion-preview"]').getAttribute('data-frame'))
      .toBe('64');
    await app.page.keyboard.press('Escape');
    expect(await app.page.getByRole('dialog', { name: 'Analyze Try' }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  },
);
