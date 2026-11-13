import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARM } from './armFixture';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

const POSED_DEG = -40;

type Studio = {
  attachRobot: (link: unknown) => void;
  load: (record: unknown) => void;
  setPose: (values: Record<string, number>) => void;
  simState: () => { playing: boolean };
  robotGhost: () => { measured: Record<string, number | null> | null; sim: Record<string, number | null> | null };
};

type StudioWindow = { __studio: Studio; __fakeRobotLink: { asked: () => unknown } };

const playing = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState().playing);

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

const familyOption = (name: string) =>
  app.page.locator(shown('[data-testid="robot-family"] [role=tab]'), { hasText: name }).first();

async function climbTo(rung: 'set_up' | 'test') {
  await app.page
    .locator(shown(`[data-robot-rung="${rung}"]`))
    .first()
    .click();
  await expect.poll(mode).toBe(rung);
}

const shoulder = async () => {
  const ghost = await app.page.evaluate(() => (window as unknown as StudioWindow).__studio.robotGhost());

  return { measured: ghost.measured?.shoulder ?? null, sim: ghost.sim?.shoulder ?? null };
};

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as StudioWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), ARM);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate a scene robot over ROS 2', () => {
  it('connects the arm as an emulated ROS 2 robot, climbs to Test and follows a posed shoulder', async () => {
    const { page } = app;

    await openPlayTab(page, 'Operate');
    expect(await familyOption('Feetech').getAttribute('aria-selected')).toBe('true');
    await familyOption('ROS 2').click();
    expect(await familyOption('ROS 2').getAttribute('aria-selected')).toBe('true');
    await page.locator(shown('button'), { hasText: 'Connect Emulated Robot' }).first().click();
    await expect
      .poll(() => page.locator(shown('[data-testid="operate-panel"]')).first().innerText())
      .toContain('2 emulated ROS 2 servos');
    expect(await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.asked())).toEqual({
      family: 'ros2',
      emulated: true,
      controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
      joints: ['Shoulder', 'Elbow'],
    });

    await climbTo('set_up');
    await climbTo('test');
    expect(await page.locator(shown('[data-robot-rung]')).count()).toBe(3);
    expect(await page.locator(shown('[data-robot-rung="rehearse"]')).count()).toBe(0);
    expect(await page.locator(shown('[data-testid="robot-calibration"]')).count()).toBe(0);
    await expect.poll(() => page.locator(shown('[data-robot-joint]')).count()).toBe(2);
    expect(await page.locator(shown('[data-robot-joint="1"]')).first().innerText()).toContain('Shoulder');

    await page.evaluate((deg) => (window as unknown as StudioWindow).__studio.setPose({ shoulder: deg }), POSED_DEG);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await page
      .locator(shown('button:not([role=tab])'), { hasText: /^Simulate$/ })
      .first()
      .click();
    await expect.poll(playing, { timeout: 60000 }).toBe(true);
    await expect.poll(async () => (await shoulder()).measured ?? 0, { timeout: 20000 }).toBeLessThan(POSED_DEG * 0.75);
    await expect
      .poll(
        async () => {
          const { measured, sim } = await shoulder();

          return Math.abs((measured ?? Infinity) - (sim ?? 0));
        },
        { timeout: 20000 },
      )
      .toBeLessThan(3);

    await openPlayTab(page, 'Operate');
    await page
      .locator(shown('button'), { hasText: /^Disconnect$/ })
      .first()
      .click();
    await expect.poll(() => page.locator(shown('[data-testid="robot-family"]')).count()).toBe(1);
    expect(app.errors).toEqual([]);
  }, 150000);
});
