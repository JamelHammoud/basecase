import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARC_CONSOLES } from '../src/cases/console/fixtures/arcConsoles';
import { presetCase } from '../src/cases/caseBuilder';
import { buildRig } from '../src/utils/kinematics';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  playing: boolean;
  activeCase: string | null;
  caseSeconds: number | null;
  tries: Array<{ passed: boolean; seconds: number }>;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));

const panelIds = () =>
  app.page
    .locator(shown('[data-testid="case-run-panel"]'))
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));

const areaCount = () => app.page.locator(shown('[data-testid="case-run-area"]')).count();

async function runCase() {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Run Case');
  await app.page.keyboard.press('Enter');
}

const inPanel = (id: string, name: string | RegExp) => panel(id).locator('button', { hasText: name }).first();

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Run Case', () => {
  it('opens a Case’s own console: its areas, a live timer and score, Try It and Reset as buttons', async () => {
    const { page } = app;
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const game = ARC_CONSOLES.find((c) => c.name === 'Block game')!.console;
    const kase = {
      ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
      id: 'block-game',
      name: 'Knock the Dots',
      console: game,
    };
    const scene = {
      name: 'block-game',
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
    };

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
    await expect.poll(() => partCount(page)).toBe(arm.parts.length);
    await openPlayTab(page, 'Cases');
    await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Knock the Dots' }).first().click();
    await expect.poll(async () => (await simState()).activeCase).toBe('block-game');

    await runCase();
    await expect.poll(panelIds).toEqual(['clock', 'score', 'go', 'reset', 'tries']);
    expect(await areaCount()).toBe(2);

    const [left, right] = await Promise.all([panel('clock').boundingBox(), panel('go').boundingBox()]);

    expect(left!.x + left!.width).toBeLessThan(right!.x);

    const clock = panel('clock').locator('[data-signal="clock"]');

    expect(await clock.textContent()).toBe('60.0 s');

    await inPanel('go', 'Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect((await simState()).playing).toBe(true);
    await expect.poll(() => inPanel('reset', 'Reset').isDisabled()).toBe(true);
    await expect
      .poll(async () => Number.parseFloat((await clock.textContent()) ?? '60'), { timeout: 30000 })
      .toBeLessThan(59);
    expect(
      Number.parseFloat((await panel('score').locator('[data-signal="score"]').textContent()) ?? ''),
    ).toBeGreaterThan(0);

    await inPanel('tries', 'Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    const ended = await simState();

    expect(ended.tries[0].seconds).toBeLessThan(ended.caseSeconds! - 1);

    await inPanel('reset', 'Reset').click();
    await expect.poll(() => clock.textContent()).toBe('60.0 s');

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    expect(app.errors).toEqual([]);
  }, 180000);
});
