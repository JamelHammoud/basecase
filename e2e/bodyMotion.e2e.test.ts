import { afterAll, beforeAll, expect, it } from 'vitest';
import type { App } from './harness';

import { openBodyMotionApp, type BodyMotionStudio as Studio } from './bodyMotionHarness';
import { narrowBodyMotionPanel, expectBodyMotionLayout } from './bodyMotionLayout';

let app: App;

const verdictOf = (checks: unknown) => (checks as { torque: unknown } | null)?.torque;

beforeAll(async () => {
  const fixture = await openBodyMotionApp();

  app = fixture.app;
  await narrowBodyMotionPanel(app.page);
  await app.page.getByRole('button', { name: 'Analyze Try', exact: true }).filter({ visible: true }).click();
  await app.page.getByRole('combobox', { name: 'Try' }).selectOption('body-motion-arm');
  await app.page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await app.page.locator('[data-body-parameter]').first().waitFor();
});

afterAll(async () => {
  await app?.close();
});

it(
  'recommends and scrubs a simulated motion through Operate without changing the robot',
  { retry: 0, timeout: 15000 },
  async () => {
    const before = await app.page.evaluate(async () => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      return {
        scene: studio.sceneRecord(),
        calibration: studio.bodyCalibrations(),
        checks: await studio.bodyChecks(),
        runtime: studio.bodyAnalysisMetrics().runtime,
      };
    });

    expect(await app.page.getByRole('button', { name: 'Preview Motion', exact: true }).isDisabled()).toBe(true);
    await expectBodyMotionLayout(app.page);
    await app.page.getByRole('dialog', { name: 'Analyze Try' }).getByRole('switch').first().press('Space');
    await app.page.getByRole('button', { name: 'Preview Motion', exact: true }).click();
    await app.page.locator('[data-testid="body-motion-preview"][data-ready="true"] canvas').waitFor();
    await app.page.getByRole('slider', { name: 'Time', exact: true }).press('Home');
    await app.page.getByRole('slider', { name: 'Time', exact: true }).press('ArrowRight');
    await expect
      .poll(() => app.page.locator('[data-testid="body-motion-preview"]').getAttribute('data-frame'))
      .toBe('1');
    expect(await app.page.getByText('Predicted', { exact: true }).count()).toBe(1);
    await expectBodyMotionLayout(app.page);
    await app.page.getByRole('button', { name: 'Method', exact: true }).press('Enter');
    expect(await app.page.locator('[data-testid="body-analysis"] details').getAttribute('open')).not.toBeNull();
    await expectBodyMotionLayout(app.page);

    const after = await app.page.evaluate(async () => {
      const studio = (window as unknown as { __studio: Studio }).__studio;

      return {
        scene: studio.sceneRecord(),
        calibration: studio.bodyCalibrations(),
        checks: await studio.bodyChecks(),
        runtime: studio.bodyAnalysisMetrics().runtime,
        commands: (window as unknown as { __bodyMotionCommands: number }).__bodyMotionCommands,
      };
    });

    expect(after.commands).toBe(0);
    expect(after.calibration).toEqual(before.calibration);
    expect(after.runtime).toEqual(before.runtime);
    expect(verdictOf(after.checks)).toEqual(verdictOf(before.checks));
    expect(after.scene.parts).toEqual(before.scene.parts);

    const bindings = (entries: unknown) =>
      (entries as Array<Record<string, unknown>>).map((entry) =>
        Object.fromEntries(Object.entries(entry).filter(([key]) => !['content', 'analyzed'].includes(key))),
      );

    expect(bindings(after.scene.project.bodyEvidence)).toEqual(bindings(before.scene.project.bodyEvidence));
    expect({ ...after.scene.project, bodyEvidence: undefined, buildGuide: undefined }).toEqual({
      ...before.scene.project,
      bodyEvidence: undefined,
      buildGuide: undefined,
    });
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  },
);
