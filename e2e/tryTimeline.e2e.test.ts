import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  tries: Array<{ passed: boolean; margin: number }>;
  selected: string[];
  timeline: {
    frame: number;
    frames: number;
    qpos: number[] | null;
    sought: number | null;
    lastQpos: number[];
    lanes: Array<{ joint: string; link: string[] }>;
  } | null;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  parts: () => unknown[];
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const sceneParts = () =>
  app.page.evaluate(() => JSON.stringify((window as unknown as { __studio: Studio }).__studio.parts()));

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

async function holdKey(key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

async function openTouchTheDots() {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: robot.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();

  const card = app.page.locator(visible('[data-testid="new-case"]'));
  const dots = card.getByLabel('Dots');

  await dots.fill('3');
  await dots.press('Enter');
  await card.locator('button', { hasText: 'Create' }).click();
  await expect.poll(async () => (await simState()).activeCase).toBe('touch-the-dots');
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('Try timeline', () => {
  itUnlessWindows('scrubs a try on the timeline under the canvas and selects a joint from its lane', async () => {
    const timeline = async () => (await simState()).timeline;

    await openTouchTheDots();
    await button('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await holdKey('w', 800);
    await button('End Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    const scene = await sceneParts();

    await app.page.getByTestId('try-row').first().locator('button[aria-label="Replay"]').click();
    await expect.poll(() => app.page.getByTestId('timeline-lane').count(), { timeout: 30000 }).toBeGreaterThan(0);
    await expect.poll(async () => (await timeline())?.sought).toBe(0);

    const opened = (await timeline())!;

    expect(opened.frames).toBeGreaterThan(40);
    await app.page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await timeline())?.sought).toBe(1);
    await app.page.keyboard.press('End');
    await expect.poll(async () => (await timeline())?.sought).toBe(opened.frames - 1);

    const end = (await timeline())!;

    expect(end.qpos).toEqual(end.lastQpos);

    const lane = end.lanes[end.lanes.length - 1];

    expect(lane.link.length).toBeGreaterThan(0);
    await app.page
      .locator(`[data-testid="timeline-lane"][data-joint="${lane.joint}"] svg`)
      .nth(1)
      .click({ position: { x: 1, y: 10 } });
    await expect.poll(async () => (await simState()).selected).toEqual(lane.link);
    await expect.poll(async () => (await timeline())?.sought).toBe(0);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('try-timeline').count()).toBe(0);
    expect((await simState()).selected).toEqual(lane.link);
    expect(await sceneParts()).toBe(scene);
    expect(app.errors).toEqual([]);
  });
});
