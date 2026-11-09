import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openApp, partCount, type App } from '../../e2e/harness';
import { drive, driveArm, driveRover, fell, forward, handMismatches, hold, state, stop, tap, wait } from './driveApp';
import { armProblems, blurProblems, groundProblems } from './driveJudge';
import { playRobot } from './play';
import { tapState } from './workerTap';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await tap(app);
}, 180000);

afterEach(async () => {
  if ((await state(app)).drive === 'off') return;

  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await state(app)).drive, { timeout: 30000 }).toBe('off');
});

afterAll(async () => {
  await app?.close();
});

describe('live drive by class', () => {
  it('drives an arm: W moves the rendered hand, S brings it back, release holds it, and the report matches', async () => {
    const before = playRobot('arm-6dof').parts.length;
    const arm = await driveArm(app, 'arm-6dof');

    expect((await state(app)).driveClass).toBe('arm');
    expect(armProblems(arm.phases)).toEqual([]);
    expect(handMismatches(arm.samples)).toEqual([]);
    expect((await tapState(app.page))?.frames).toBeGreaterThan(0);
    expect(await partCount(app.page)).toBe(before);
    await stop(app);
  }, 180000);

  it('drives a rover: W forward, S back, release stops, losing focus stops', async () => {
    const phases = await driveRover(app);

    expect((await state(app)).driveClass).toBe('rover');
    expect(groundProblems(phases)).toEqual([]);

    await app.page.mouse.click(720, 450);
    await app.page.keyboard.down('w');
    await wait(app, 1000);
    await app.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wait(app, 300);

    const atBlur = await forward(app);

    await wait(app, 1500);
    await app.page.keyboard.up('w');
    expect(blurProblems(atBlur, await forward(app))).toEqual([]);
    await stop(app);
  }, 180000);

  it('walks a hexapod: W forward without a fall, release stops', async () => {
    await drive(app, 'hexapod');
    expect((await state(app)).driveClass).toBe('legs');

    const start = await forward(app);

    await wait(app, 1000);

    const afterIdle = await forward(app);

    await hold(app, 'w', 3000);

    const afterForward = await forward(app);

    await wait(app, 1500);

    const afterRelease = await forward(app);

    expect(groundProblems({ start, afterIdle, afterForward, afterRelease, fell: await fell(app) })).toEqual([]);
    await stop(app);
    expect(app.errors).toEqual([]);
  }, 180000);
});
