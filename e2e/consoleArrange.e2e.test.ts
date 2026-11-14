import type { Locator } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import type { CaseConsole } from '../src/cases/console/format';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  runCase: (id: string) => void;
  caseConsole: () => CaseConsole | null;
  caseRunState: () => { open: boolean };
  simState: () => { drive: string };
};

const caseConsole = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseConsole());
const drive = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().drive);

const CONSOLE: CaseConsole = {
  input: ['keys'],
  panels: [
    { id: 'brief', kind: 'text', title: 'Brief', of: 'brief' },
    { id: 'reach', kind: 'plot', title: 'Reach', signals: ['joint.*.position'] },
    { id: 'tries', kind: 'list', of: 'tries' },
  ],
  layout: {
    areas: [{ size: 300, panels: ['brief'] }, { canvas: true }, { size: 360, panels: ['reach', 'tries'] }],
  },
};

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));
const panelIds = () =>
  app.page
    .locator(shown('[data-testid="case-run-panel"]'))
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));
const columns = async () => (await caseConsole())?.layout.areas.map((a) => ('canvas' in a ? 'canvas' : a.panels));

async function dragBy(handle: Locator, to: { x: number; y: number }) {
  const box = (await handle.boundingBox())!;
  const { mouse } = app.page;

  await mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await mouse.down();
  await mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);
  await mouse.move(to.x, to.y, { steps: 8 });
  await mouse.up();
}

async function addPanel(...picks: string[]) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Add Panel');
  await app.page.keyboard.press('Enter');

  for (const pick of picks) {
    await expect.poll(() => app.page.getByRole('button', { name: pick, exact: true }).count()).toBe(1);
    await app.page.keyboard.type(pick);
    await app.page.keyboard.press('Enter');
  }
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('arranging a running Case’s console by hand', () => {
  it('moves, resizes, adds and deletes panels during a try, and the Case reopens that way', async () => {
    const { page } = app;
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const kase = {
      ...presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts),
      id: 'reach-console',
      name: 'Reach Console',
      console: CONSOLE,
    };

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'reach-console',
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(page)).toBe(arm.parts.length);
    await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.runCase('reach-console'));
    await expect.poll(panelIds).toEqual(['brief', 'reach', 'tries']);

    const left = (await page.locator(shown('[data-area="0"]')).boundingBox())!;

    await dragBy(panel('reach').getByTestId('panel-grip'), {
      x: left.x + left.width / 2,
      y: left.y + left.height - 40,
    });
    await expect.poll(columns).toEqual([['brief', 'reach'], 'canvas', ['tries']]);

    const resizer = page.locator(shown('[data-area="0"] [role="separator"]'));
    const edge = (await resizer.boundingBox())!;

    await dragBy(resizer, { x: edge.x + edge.width / 2 + 100, y: edge.y + 300 });
    await expect
      .poll(async () => (await caseConsole())?.layout.areas[0])
      .toEqual({
        size: 400,
        panels: ['brief', 'reach'],
      });

    await panel('tries').getByRole('button', { name: 'Try It' }).click();
    await expect.poll(() => drive(), { timeout: 60000 }).toBe('on');
    await addPanel('Value', 'time');
    await expect.poll(panelIds).toEqual(['brief', 'reach', 'tries', 'value']);
    expect(await drive()).toBe('on');
    await panel('tries').getByRole('button', { name: 'Stop Try' }).click();

    await panel('reach').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Reach?' });

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(panelIds).toEqual(['brief', 'tries', 'value']);
    await page.keyboard.press('Meta+z');
    await expect.poll(panelIds).toEqual(['brief', 'reach', 'tries', 'value']);
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(panelIds).toEqual(['brief', 'tries', 'value']);

    const arranged = await caseConsole();

    await expect.poll(drive).toBe('off');

    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.caseRunState().open))
      .toBe(false);
    await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.runCase('reach-console'));
    await expect.poll(panelIds).toEqual(['brief', 'tries', 'value']);
    expect(await caseConsole()).toEqual(arranged);
    expect(arranged?.layout.areas).toEqual([
      { size: 400, panels: ['brief'] },
      { canvas: true },
      { size: 360, panels: ['tries', 'value'] },
    ]);
    expect(app.errors).toEqual([]);
  }, 180000);
});
