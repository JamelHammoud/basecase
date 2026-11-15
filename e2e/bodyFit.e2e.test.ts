import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyBodyFit } from '../src/reality/bodyModel';
import { recordedBodyRun } from '../src/reality/bodyFit.fixtures';
import type { BodyHistory } from '../src/reality/bodyTypes';
import type { RobotRun } from '../src/robot/runBuffer';
import type { SimModel } from '../src/sim/mjcfTypes';
import { ARM } from './armFixture';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, type App } from './harness';

interface BodyStudio {
  load: (record: unknown) => void;
  attachRobot: (link: unknown) => void;
  setBodyRun: (run: RobotRun | null) => void;
  bodyModel: (withoutBody?: boolean) => Promise<SimModel>;
  bodyCalibrations: () => Record<string, BodyHistory>;
  bodyChecks: () => Promise<{ fingerprint: string; checkedAt: string; torque: unknown }>;
  simTool: (kind: string, payload: Record<string, unknown>) => Promise<{ text: string }>;
}

type BodyWindow = { __studio: BodyStudio; __fakeRobotLink: unknown };

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;
const body = () => app.page.locator(visible('[data-testid="body-calibration"]')).first();
const model = (withoutBody = true) =>
  app.page.evaluate((preset) => (window as unknown as BodyWindow).__studio.bodyModel(preset), withoutBody);
const history = (robot: string) =>
  app.page.evaluate((key) => (window as unknown as BodyWindow).__studio.bodyCalibrations()[key], robot);
const checks = () => app.page.evaluate(() => (window as unknown as BodyWindow).__studio.bodyChecks());

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate((record) => {
    const target = window as unknown as BodyWindow;

    target.__studio.attachRobot(target.__fakeRobotLink);
    target.__studio.load(record);
  }, ARM);
  await openPlayTab(app.page, 'Operate');
  await app.page
    .locator(visible('button'), { hasText: /^Connect Emulated Robot$/ })
    .first()
    .click();
  await expect.poll(() => app.page.locator(visible('button'), { hasText: /^Disconnect$/ }).count()).toBe(1);
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Fit Body', () => {
  it('fits recorded twin motion, reruns Checks and rolls back through confirmation', async () => {
    const baseline = await model();
    const robot = baseline.robots[0].key;
    const forearm = baseline.bodies.find((entry) => entry.joint === 'shoulder')!.name;
    const hand = baseline.bodies.find((entry) => entry.joint === 'elbow')!.name;
    const planted = applyBodyFit(baseline, robot, {
      massScales: { [forearm]: 1.3 },
      payloadKg: { [hand]: 0.15 },
      floorFrictionScale: 1,
    });
    const run = recordedBodyRun(await loadMujoco(), planted);
    const before = await checks();

    await app.page.evaluate((recorded) => (window as unknown as BodyWindow).__studio.setBodyRun(recorded), run);
    await body().getByRole('button', { name: 'Fit Body', exact: true }).click();
    await expect.poll(async () => (await history(robot))?.active).toBe(1);
    expect((await history(robot)).versions[0].evidence.gain).toBeGreaterThanOrEqual(0.25);
    expect((await model(false)).robots[0].fingerprint).not.toBe(baseline.robots[0].fingerprint);

    const fitted = await checks();

    expect(fitted.fingerprint).not.toBe(before.fingerprint);
    expect(fitted.checkedAt).not.toBe(before.checkedAt);
    expect(fitted.torque).toBeDefined();
    expect(fitted.torque).not.toEqual(before.torque);
    await body().getByRole('button', { name: 'Roll Back', exact: true }).click();
    expect((await history(robot)).active).toBe(1);
    await app.page.getByRole('dialog').getByRole('button', { name: 'Roll Back', exact: true }).click();
    await expect.poll(async () => (await history(robot)).active).toBeNull();
    expect((await model(false)).robots[0].fingerprint).toBe(baseline.robots[0].fingerprint);
    expect((await checks()).fingerprint).not.toBe(fitted.fingerprint);
    expect(app.errors).toEqual([]);
  });

  it('routes the palette and agent through the same recording action', async () => {
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Fit Body');
    await app.page.keyboard.press('Enter');
    await expect
      .poll(async () => (await app.page.locator(visible('[role="status"]')).allTextContents()).join(' '))
      .toContain('Record a robot run');

    const reply = await app.page.evaluate(() => (window as unknown as BodyWindow).__studio.simTool('fit_body', {}));

    expect(reply.text).toContain('Record a robot run');
    expect(app.errors).toEqual([]);
  });
});
