import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  tries: Array<{ passed: boolean; margin: number }>;
  selected: string[];
  timeline: {
    seed: number | null;
    trips: Array<{ label: string; frame: number }>;
    frame: number;
    frames: number;
    qpos: number[] | null;
    sought: number | null;
    lastQpos: number[];
    lanes: Array<{ joint: string; link: string[] }>;
  } | null;
}

interface TrailEnd {
  seed: number;
  passed: boolean;
  x: number;
  y: number;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  parts: () => unknown[];
  caseTrails: () => TrailEnd[];
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
  await card.locator('button', { hasText: 'Make Case' }).click();
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
    await button('Stop Try').click();
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

describe('Seeded runs on the canvas', () => {
  const base = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const rover = { ...base, joints: base.joints.map((j) => ({ ...j, effortNm: 0.15 })) };
  const flag = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
  const trails = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseTrails());
  const checks = () => app.page.locator(visible('section'), { hasText: /^Checks/ }).first();

  const loneFailure = (ends: TrailEnd[]) => {
    const failed = ends.filter((e) => !e.passed);
    const gap = (e: TrailEnd) =>
      Math.min(Infinity, ...failed.filter((o) => o !== e).map((o) => Math.hypot(o.x - e.x, o.y - e.y)));

    return failed.sort((a, b) => gap(b) - gap(a))[0];
  };

  it('draws every run from the Case’s Checks row, and opens a failed one on the try timeline', async () => {
    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: rover.id,
      parts: rover.parts,
      project: { ...DEFAULT_PROJECT, joints: rover.joints, cases: [flag] },
    });
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks().getByRole('button', { name: /^Reach a Spot/ });

    await expect.poll(() => row.getAttribute('data-status'), { timeout: 90000 }).toMatch(/fail|warn/);
    await row.click();
    await expect.poll(async () => (await trails()).length, { timeout: 10000 }).toBe(20);

    const box = (await app.page.locator(visible('canvas')).first().boundingBox())!;
    const inside = (e: TrailEnd) =>
      e.x > box.x + 8 && e.x < box.x + box.width - 8 && e.y > box.y + 8 && e.y < box.y + box.height - 8;
    const failed = loneFailure((await trails()).filter(inside));

    expect(failed).toBeDefined();
    await app.page.mouse.click(failed.x, failed.y);
    await expect.poll(async () => (await simState()).timeline?.seed, { timeout: 30000 }).toBe(failed.seed);

    const shown = (await simState()).timeline!;

    expect(shown.frame).toBe(shown.trips[0]?.frame ?? 0);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByTestId('try-timeline').count()).toBe(0);
    expect(app.errors).toEqual([]);
  }, 150000);
});
