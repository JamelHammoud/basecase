import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import type { CaseConsole } from '../src/cases/console/format';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  simState: () => { drive: string; activeCase: string | null; tries: unknown[] };
  caseConsole: () => CaseConsole | null;
};

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());
const saved = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseConsole());
const areaPanels = async () => (await saved())?.layout.areas.map((a) => ('panels' in a ? a.panels : 'canvas'));
const areaSize = async (at: number) => {
  const area = (await saved())?.layout.areas[at];

  return area && 'size' in area ? area.size : null;
};

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));
const area = (at: number) => app.page.locator(shown(`[data-console-area="${at}"]`));
const dialog = () => app.page.locator(shown('[role=dialog]'));
const panelIds = () =>
  app.page
    .locator(shown('[data-testid="case-run-panel"]'))
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));

async function palette(command: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(command);
  await app.page.keyboard.press('Enter');
}

async function dragBy(from: { x: number; y: number }, to: { x: number; y: number }) {
  const { mouse } = app.page;

  await mouse.move(from.x, from.y);
  await mouse.down();
  await mouse.move(from.x + 6, from.y + 6, { steps: 2 });
  await mouse.move(to.x, to.y, { steps: 8 });
  await mouse.up();
}

async function menu(id: string, item: string) {
  await panel(id).click({ button: 'right', position: { x: 40, y: 6 } });
  await app.page.locator(shown('[role=menuitem]'), { hasText: item }).first().click();
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('arranging a running Case’s console by hand', () => {
  it('moves, resizes, adds and deletes panels during a try, saved with the Case', async () => {
    const { page } = app;
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const preset = presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts);
    const kase = { ...preset, id: 'touch', task: { ...preset.task, seconds: 60 } };

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'console-edit',
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(page)).toBe(arm.parts.length);
    await openPlayTab(page, 'Cases');
    await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
    await expect.poll(async () => (await simState()).activeCase).toBe('touch');
    await palette('Run Case');
    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'servos', 'tries']);
    expect(await saved()).toBeNull();

    await panel('tries').locator('button', { hasText: 'Try It' }).first().click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

    const brief = (await panel('brief').boundingBox())!;
    const left = (await area(0).boundingBox())!;

    await dragBy({ x: brief.x + 60, y: brief.y + 4 }, { x: left.x + left.width / 2, y: left.y + left.height - 40 });
    await expect.poll(areaPanels).toEqual([['cameras', 'brief'], 'canvas', ['failures', 'servos', 'tries']]);

    const gap = (await area(2).locator('[role=separator]').boundingBox())!;

    await dragBy({ x: gap.x + 4, y: gap.y + 300 }, { x: gap.x + 4 - 80, y: gap.y + 300 });
    await expect.poll(() => areaSize(2)).toBe(408);
    expect((await area(2).boundingBox())!.width).toBe(416);
    expect((await simState()).drive).toBe('on');

    await panel('tries').locator('button', { hasText: 'Stop Try' }).first().click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

    await palette('Add Panel');
    await dialog().locator('[role=radio]', { hasText: 'Value' }).click();
    await dialog()
      .locator('[role=menuitem]', { hasText: /^time$/ })
      .click();
    await dialog().locator('button', { hasText: 'Add Panel' }).click();
    await expect.poll(() => dialog().count()).toBe(0);
    await expect
      .poll(async () => (await saved())?.panels.at(-1))
      .toEqual({
        id: 'value',
        kind: 'value',
        title: 'time',
        signal: 'time',
      });
    await expect.poll(() => panel('value').count()).toBe(1);

    await menu('value', 'Rename');
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Clock');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await saved())?.panels.find((p) => p.id === 'value')?.title).toBe('Clock');

    await menu('servos', 'Delete');
    await expect.poll(() => dialog().locator('h2').textContent()).toBe('Delete Servos?');
    await dialog().locator('button', { hasText: 'Delete' }).click();
    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'tries', 'value']);
    await page.keyboard.press('Meta+z');
    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'servos', 'tries', 'value']);
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'tries', 'value']);

    const arranged = await saved();

    await expect.poll(async () => (await simState()).drive).toBe('off');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator(shown('[data-testid="case-run-area"]')).count()).toBe(0);
    await palette('Run Case');
    await expect.poll(panelIds).toEqual(['cameras', 'brief', 'tries', 'value']);
    expect(await saved()).toEqual(arranged);
    expect(arranged!.layout.areas).toEqual([
      { size: 400, panels: ['cameras', 'brief'] },
      { canvas: true },
      { size: 408, panels: ['failures', 'tries', 'value'] },
    ]);
    expect(app.errors).toEqual([]);
  }, 180000);
});
