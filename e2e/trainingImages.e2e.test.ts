import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Studio = { load: (record: unknown) => void };

beforeEach(async () => {
  app = await openApp();
}, 120000);
afterEach(async () => {
  await app?.close();
});

describe('training images from a Case', () => {
  it('opens camera and class choices from the command palette', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const result = buildCase(
      { goal: 'pick', world: 'floor' },
      builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
    );

    if (!result.ok) throw new Error(result.problem);

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: robot.id,
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [result.kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Make Training Images');
    await app.page.locator(shown('button[data-idx]')).filter({ hasText: 'Make Training Images' }).first().click();

    const dialog = app.page.getByRole('dialog', { name: 'Make Training Images' });

    await dialog.getByLabel('Count', { exact: true }).fill('2');
    await dialog.getByLabel('Count', { exact: true }).press('Tab');
    expect(await dialog.getByLabel('Count', { exact: true }).inputValue()).toBe('2');

    const make = dialog.getByRole('button', { name: 'Make Training Images', exact: true });
    const camera = dialog.getByRole('switch', { name: 'Scene', exact: true });
    const block = dialog.getByRole('switch', { name: 'Block', exact: true });

    expect(await camera.getAttribute('aria-checked')).toBe('true');
    expect(await block.getAttribute('aria-checked')).toBe('true');
    expect(await make.isEnabled()).toBe(true);
    await camera.click();
    await expect.poll(() => make.isEnabled()).toBe(false);
    await camera.click();
    await expect.poll(() => make.isEnabled()).toBe(true);

    const switches = dialog.getByRole('switch');

    for (const choice of await switches.all()) {
      if ((await choice.getAttribute('aria-label')) !== 'Scene') await choice.click();
    }

    await expect.poll(() => make.isEnabled()).toBe(false);
    await block.click();
    await expect.poll(() => make.isEnabled()).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
