import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { g1Humanoid } from './g1Fixture';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

const G1 = g1Humanoid();
const RIGHT_SHOULDER_ID = 23;
const POSED_DEG = -40;
const POSED_RAD = (POSED_DEG / 180) * Math.PI;

type Studio = {
  attachRobot: (link: unknown) => void;
  load: (record: unknown) => void;
  setPose: (values: Record<string, number>) => void;
  simState: () => { status: string; playing: boolean };
};

const radians = (counts: number) => ((counts - 2048) * 2 * Math.PI) / 4096;

const shoulderRadians = async () =>
  radians(
    Number(
      await app.page
        .locator(shown(`[data-robot-joint="${RIGHT_SHOULDER_ID}"]`))
        .first()
        .getAttribute('data-position'),
    ),
  );

const writes = () =>
  app.page.evaluate(() =>
    (window as unknown as { __fakeRobotLink: { writes: () => Record<string, number> } }).__fakeRobotLink.writes(),
  );

const mode = () => app.page.locator(shown('[data-testid="robot-mode"]')).first().getAttribute('data-mode');

async function climbTo(rung: 'set_up' | 'test') {
  await app.page
    .locator(shown(`[data-robot-rung="${rung}"]`))
    .first()
    .click();
  await expect.poll(mode).toBe(rung);
}

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as { __studio: Studio; __fakeRobotLink: unknown };

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate an emulated Unitree G1', () => {
  it('connects the G1, climbs to Test and follows a posed right shoulder without writing the legs', async () => {
    const { page } = app;

    await openPlayTab(page, 'Operate');
    await page.locator(shown('button'), { hasText: 'Connect Emulated Robot' }).first().click();
    await expect
      .poll(() => page.locator(shown('[data-testid="operate-panel"]')).first().innerText())
      .toContain('17 emulated G1 servos');
    await climbTo('set_up');
    await climbTo('test');
    expect(await page.locator(shown('[data-robot-rung="rehearse"]')).count()).toBe(0);
    await expect.poll(() => page.locator(shown('[data-robot-joint]')).count()).toBe(17);
    expect(await page.locator(shown('[data-testid="robot-calibration"]')).count()).toBe(0);
    expect(await shoulderRadians()).toBeCloseTo(0, 2);

    await page.evaluate((values) => (window as unknown as { __studio: Studio }).__studio.setPose(values), {
      right_shoulder_pitch_joint: POSED_DEG,
    });
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await page
      .locator(shown('button:not([role=tab])'), { hasText: /^Simulate$/ })
      .first()
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().playing), {
        timeout: 60000,
      })
      .toBe(true);
    await expect.poll(shoulderRadians, { timeout: 20000 }).toBeLessThan(POSED_RAD * 0.75);

    const written = await writes();

    expect(written[RIGHT_SHOULDER_ID]).toBeGreaterThan(0);
    expect(Array.from({ length: 12 }, (_, k) => written[k + 1])).toEqual(Array(12).fill(0));
    expect(Object.keys(written)).toHaveLength(29);
    expect(app.errors).toEqual([]);
  }, 150000);
});
