import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FixedCamera } from '../src/cameras/fixed';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

type Studio = { simState: () => { drive: string }; load: (r: unknown) => void };

const outside: FixedCamera = {
  id: 'outside',
  name: 'Outside',
  position: [600, 500, 900],
  target: [0, 50, 0],
  lens: { model: 'pinhole', hfovDeg: 60 },
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const frames = async () => Number((await app.page.getByTestId('camera-strip').getAttribute('data-frames')) ?? 0);

const drive = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().drive as string);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('camera views', () => {
  it('follow the simulation in realtime while the robot drives', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'rover-diff')!;

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'rover-diff',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, cameras: [outside] },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
    await expect.poll(() => app.page.getByTestId('camera-tile').count()).toBe(1);

    await app.page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await app.page
      .locator(visible('button'), { hasText: /^Drive$/ })
      .first()
      .click();
    await expect.poll(drive, { timeout: 60000 }).toBe('on');

    await app.page.mouse.click(720, 450);
    await app.page.keyboard.down('w');
    await app.page.waitForTimeout(500);

    const start = await frames();

    await app.page.waitForTimeout(1500);

    const end = await frames();

    await app.page.keyboard.up('w');
    expect(end - start).toBeGreaterThan(15);
  });
});
