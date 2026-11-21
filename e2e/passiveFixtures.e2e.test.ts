import { afterEach, beforeEach, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (scene: unknown) => void;
  simState: () => { drive: string; tries: Array<{ id: string; passed: boolean }>; timeline: unknown };
  fixtureTravel: () => number[];
}

const studioState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

beforeEach(async () => {
  app = await openApp();
});

afterEach(async () => {
  await app?.close();
});

for (const name of ['Open a Lid', 'Pull a Drawer']) {
  it(`creates ${name}, edits its weight and reopens its recorded reference`, async () => {
    const robot = fixtureRobots().find((arm) => arm.id === 'arm-6dof')!;
    const { page } = app;

    await page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
      name: robot.id,
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await openPlayTab(page, 'Cases');
    await page.locator(shown('button'), { hasText: 'New Case' }).first().click();

    const builder = page.locator(shown('[data-testid="new-case"]'));

    await builder.getByRole('radio', { name, exact: true }).click();
    await builder.getByLabel('Weight').fill('35');
    await builder.getByLabel('Weight').press('Enter');
    await builder.getByRole('button', { name: 'Make Case', exact: true }).click();
    await page.locator(shown('button'), { hasText: 'Try Reference' }).first().click();
    await expect.poll(async () => (await studioState()).drive).toBe('on');
    await expect.poll(async () => (await studioState()).tries.length).toBe(1);
    expect((await studioState()).tries[0].passed).toBe(true);
    await page.locator(shown('[data-testid="try-row"]')).first().click();
    await expect.poll(async () => (await studioState()).timeline).not.toBeNull();

    const travel = await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.fixtureTravel());

    expect(Math.max(...travel)).toBeGreaterThan(20);
    expect(Math.abs(travel[0])).toBeLessThan(2);
    expect(app.errors).toEqual([]);
  });
}
