import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { g1Humanoid } from './g1Fixture';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

const G1 = g1Humanoid();

type Studio = {
  attachRobot: (link: unknown) => void;
  load: (record: unknown) => void;
};

type StudioWindow = { __studio: Studio; __fakeRobotLink: { asked: () => unknown } };

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
    const w = window as unknown as StudioWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), G1);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(G1.parts.length), { timeout: 10000 });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate an emulated Unitree G1', () => {
  it('connects the G1 and offers its writable joints and Test controls', async () => {
    const { page } = app;

    await openPlayTab(page, 'Operate');
    await page.locator(shown('button'), { hasText: 'Connect Emulated Robot' }).first().click();
    await expect
      .poll(() => page.locator(shown('[data-testid="operate-panel"]')).first().innerText())
      .toContain('17 emulated G1 servos');
    expect(await page.evaluate(() => (window as unknown as StudioWindow).__fakeRobotLink.asked())).toEqual({
      family: 'unitree-g1',
      emulated: true,
    });
    await climbTo('set_up');
    await climbTo('test');
    expect(await page.locator(shown('[data-robot-rung]')).count()).toBe(3);
    expect(await page.locator(shown('[data-robot-rung="rehearse"]')).count()).toBe(0);
    await expect.poll(() => page.locator(shown('[data-robot-joint]')).count()).toBe(17);
    expect(
      await page
        .locator(shown('[data-robot-joint]'))
        .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-robot-joint')))),
    ).toEqual(Array.from({ length: 17 }, (_, k) => k + 13));
    expect(await page.locator(shown('[data-testid="robot-calibration"]')).count()).toBe(0);
    expect(await page.locator(shown('[data-robot-joint="23"]')).first().innerText()).toContain(
      'right_shoulder_pitch_joint',
    );
    await expect
      .poll(() => page.locator(shown('[data-robot-joint="23"]')).first().getAttribute('data-position'))
      .toBe('2048');
    await page
      .locator(shown('button'), { hasText: /^Disconnect$/ })
      .first()
      .click();
    await expect.poll(() => page.locator(shown('[data-robot-joint]')).count()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 15000);
});
