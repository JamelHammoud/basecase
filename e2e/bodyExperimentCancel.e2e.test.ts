import { afterAll, beforeAll, expect, it } from 'vitest';
import { openBodyExperimentApp } from './bodyExperimentHarness';
import type { App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openBodyExperimentApp({ second: true });
});
afterAll(async () => {
  await app?.close();
});

it(
  'stops a selected motion without sending another intent or addressing the other connected unit',
  { retry: 0, timeout: 15000 },
  async () => {
    const { page } = app;
    const counts = () =>
      page.evaluate(() => {
        const link = (window as unknown as { __fakeRobotLink: { units: Record<string, { intents: unknown[] }> } })
          .__fakeRobotLink;

        return Object.fromEntries(Object.entries(link.units).map(([unit, entry]) => [unit, entry.intents.length]));
      });
    const before = await counts();

    await page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
    await page.getByRole('combobox', { name: 'Try' }).selectOption('body-experiment-source');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.getByRole('dialog', { name: 'Analyze Try' }).getByRole('switch').first().click();
    await page.getByRole('button', { name: 'Preview Motion', exact: true }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('dialog', { name: 'Analyze Try' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await page.locator('[data-experiment-completion="cancelled"]').waitFor({ state: 'attached' });

    const stopped = await counts();

    expect(stopped['robot-2']).toBe(before['robot-2']);
    await page.getByRole('button', { name: 'Method', exact: true }).click();
    expect(await counts()).toEqual(stopped);
    expect(await page.getByRole('button', { name: 'Fit Body', exact: true }).isDisabled()).toBe(true);
    expect(app.errors).toEqual([]);
  },
);
