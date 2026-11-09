import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { openApp, partCount, type App } from '../../e2e/harness';
import { armProblems, blurProblems, groundProblems, type V3 } from './driveJudge';
import { playRobot } from './play';

interface PlayState {
  drive: string;
  driveClass: string | null;
  effector?: V3 | null;
  stats: { time: number; robots: Array<{ forward: number; fellAt: number | null }> } | null;
}

type Studio = { simState: () => PlayState; load: (r: unknown) => void };

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const state = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const forward = async () => (await state()).stats?.robots[0]?.forward ?? 0;

const fell = async () => ((await state()).stats?.robots[0]?.fellAt ?? null) !== null;

async function effector(): Promise<V3> {
  const at = (await state()).effector;

  if (!at) throw new Error('simState().effector is missing: an arm drive must report its hand in mm, world frame');

  return at;
}

async function drive(id: string) {
  const robot = playRobot(id);

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.locator(visible('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await app.page
    .locator(visible('button'), { hasText: /^Drive$/ })
    .first()
    .click();
  await expect.poll(async () => (await state()).drive, { timeout: 60000 }).toBe('on');
  await app.page.mouse.click(720, 450);
}

async function hold(key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

const wait = (ms: number) => app.page.waitForTimeout(ms);

async function stop() {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await state()).drive).toBe('off');
}

beforeAll(async () => {
  app = await openApp();
}, 180000);

afterEach(async () => {
  if ((await state()).drive === 'off') return;

  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await state()).drive, { timeout: 30000 }).toBe('off');
});

afterAll(async () => {
  await app?.close();
});

describe('live drive by class', () => {
  it('drives an arm: W moves the hand, S brings it back, release holds it', async () => {
    await drive('arm-6dof');
    expect((await state()).driveClass).toBe('arm');

    const before = await partCount(app.page);
    const start = await effector();

    await wait(1000);

    const afterIdle = await effector();

    await hold('w', 1500);

    const afterForward = await effector();

    await hold('s', 1500);

    const afterBack = await effector();

    await wait(1000);

    const afterRelease = await effector();

    expect(armProblems({ start, afterIdle, afterForward, afterBack, afterRelease, fell: await fell() })).toEqual([]);
    expect(await partCount(app.page)).toBe(before);
    await stop();
  }, 180000);

  it('drives a rover: W forward, S back, release stops, losing focus stops', async () => {
    await drive('rover-diff');
    expect((await state()).driveClass).toBe('rover');

    const start = await forward();

    await wait(1000);

    const afterIdle = await forward();

    await hold('w', 2500);

    const afterForward = await forward();

    await hold('s', 2500);

    const afterBack = await forward();

    await wait(1000);

    const afterRelease = await forward();

    expect(groundProblems({ start, afterIdle, afterForward, afterBack, afterRelease, fell: await fell() })).toEqual([]);

    await app.page.mouse.click(720, 450);
    await app.page.keyboard.down('w');
    await wait(1000);
    await app.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wait(300);

    const atBlur = await forward();

    await wait(1500);
    await app.page.keyboard.up('w');
    expect(blurProblems(atBlur, await forward())).toEqual([]);
    await stop();
  }, 180000);

  it('walks a hexapod: W forward without a fall, release stops', async () => {
    await drive('hexapod');
    expect((await state()).driveClass).toBe('legs');

    const start = await forward();

    await wait(1000);

    const afterIdle = await forward();

    await hold('w', 3000);

    const afterForward = await forward();

    await wait(1500);

    const afterRelease = await forward();

    expect(groundProblems({ start, afterIdle, afterForward, afterRelease, fell: await fell() })).toEqual([]);
    await stop();
    expect(app.errors).toEqual([]);
  }, 180000);
});
