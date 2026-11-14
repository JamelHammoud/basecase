import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  tries: Array<{ passed: boolean }>;
  timeline: { frames: number; sought: number | null } | null;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  runCase: (id: string) => void;
  referenceTry: () => Promise<void>;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const timeline = async () => (await simState()).timeline;
const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));
const plot = () => panel('arm').getByTestId('plot');
const areaCount = () => app.page.locator(shown('[data-testid="case-run-area"]')).count();

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const elbow = arm.joints.at(-1)!.id;

const kase = {
  ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
  id: 'playback',
  name: 'Playback',
  console: {
    input: ['keys'],
    panels: [
      { id: 'elbow', kind: 'value', signal: `joint.${elbow}.position` },
      { id: 'arm', kind: 'plot', signals: ['joint.*.position'] },
      { id: 'tries', kind: 'list', of: 'tries' },
    ],
    layout: { areas: [{ canvas: true }, { size: 360, panels: ['elbow', 'arm', 'tries'] }] },
  },
};

const laneReading = (joint: string) =>
  app.page.locator(`[data-testid="timeline-lane"][data-joint="${joint}"] span`).nth(1).innerText();

const number = (text: string) => Number.parseFloat(text.replace(/[^\d.-]/g, ''));

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Try playback', () => {
  it('plays a try through its console, seeks from a plot, and goes back to live on Esc', async () => {
    const { page } = app;

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'playback',
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(page)).toBe(arm.parts.length);
    await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.runCase('playback'));
    await expect.poll(areaCount).toBe(1);
    await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
    await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
    expect(await plot().getAttribute('data-playhead')).toBeNull();

    await panel('tries').getByTestId('try-row').first().locator('button[aria-label="Replay"]').click();
    await expect.poll(async () => (await timeline())?.sought, { timeout: 30000 }).toBe(0);
    await expect.poll(() => plot().getAttribute('data-playhead'), { timeout: 30000 }).not.toBeNull();

    const { frames } = (await timeline())!;
    const half = Math.round(0.5 * (frames - 1));
    const box = (await plot().boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await timeline())?.sought).toBe(half);
    await expect.poll(async () => Number(await plot().getAttribute('data-playhead'))).toBeCloseTo(half / 50, 1);

    const value = number(await panel('elbow').locator(`[data-signal="joint.${elbow}.position"]`).innerText());

    expect(Math.abs(value - number(await laneReading(elbow)))).toBeLessThan(0.06);

    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await timeline())?.sought).toBe(half + 1);
    await page.keyboard.press(']');
    await expect.poll(() => page.getByTestId('timeline-speed').innerText()).toBe('2×');
    await page.keyboard.press(' ');
    await expect.poll(async () => (await timeline())?.sought ?? 0, { timeout: 10000 }).toBeGreaterThan(half + 10);
    await page.keyboard.press(' ');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.getByTestId('try-timeline').count()).toBe(0);
    await expect.poll(() => plot().getAttribute('data-playhead')).toBeNull();
    expect(await areaCount()).toBe(1);
    expect(app.errors).toEqual([]);
  }, 180000);
});
