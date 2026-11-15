import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shapeKey } from '../src/print/shapeKey';
import { DEFAULT_PROJECT, type ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface RepairStep {
  shown: string[];
  repairPhase: 'remove' | 'swap' | 'reassemble';
}

interface Studio {
  load: (record: unknown) => void;
  buildAlongSteps: () => RepairStep[];
  printPlates: () => { open: boolean; fitTest: boolean; plates: string[][] };
}

let app: App;

const box = (id: string, y: number): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 30, height: 20, depth: 30 },
  color: '#d8d8d8',
  note: '',
  visible: true,
  locked: false,
});

const bracket = { ...box('bracket', 30), print: { skip: true, copies: 3 } };
const parts = [box('base', 10), bracket, box('forearm', 50)];
const record = {
  name: 'Repair arm',
  parts,
  project: {
    ...DEFAULT_PROJECT,
    prints: [
      {
        id: 'original-print',
        plate: 1,
        material: 'PLA',
        hash: 'original-plate',
        parts: parts.map((part) => ({ id: part.id, key: shapeKey(part) })),
        printer: 'default',
        sentAt: '2026-11-14T00:00:00.000Z',
        state: 'printed',
      },
    ],
  },
};

const toolbar = () => app.page.locator(shown('[role="toolbar"][aria-label="Build Along"]'));
const bracketRow = () => app.page.locator(shown('[data-layer-row="part:bracket"]')).first();
const plan = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.buildAlongSteps());
const plates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());

async function expectRepairPlan() {
  await expect.poll(() => toolbar().getAttribute('data-step')).toBe('1');

  const steps = await plan();

  expect(steps.map((step) => step.repairPhase)).toEqual(expect.arrayContaining(['remove', 'swap', 'reassemble']));
  expect(steps.filter((step) => step.repairPhase === 'swap')).toHaveLength(1);
  expect(await toolbar().innerText()).toContain(`1 of ${steps.length}`);

  return steps;
}

beforeEach(async () => {
  app = await openApp();
  await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), record);
  await expect.poll(() => partCount(app.page)).toBe(parts.length);
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Layers"]')).first().click();
});

afterEach(async () => {
  await app?.close();
});

describe('Repair', () => {
  it('opens teardown from the part menu and prints one replacement at the swap step', async () => {
    await bracketRow().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Repair', exact: true }).click();

    const steps = await expectRepairPlan();
    const swap = steps.findIndex((step) => step.repairPhase === 'swap');

    for (let index = 0; index < swap; index++) await app.page.keyboard.press('ArrowRight');

    await expect.poll(() => toolbar().getAttribute('data-step')).toBe(String(swap + 1));
    await toolbar().getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(plates).toEqual({ open: true, fitTest: false, plates: [['bracket']] });
    expect(await app.page.locator(shown('[aria-label="Copies"]')).count()).toBe(0);
    expect(
      await app.page
        .locator(shown('span'))
        .filter({ hasText: /^Don't print$/ })
        .count(),
    ).toBe(0);
    expect(app.errors).toEqual([]);
  }, 15000);

  it('opens the same repair walkthrough from the selected part’s command', async () => {
    await bracketRow().click();
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Repair');
    await app.page.keyboard.press('Enter');
    await expectRepairPlan();
    expect(app.errors).toEqual([]);
  }, 15000);
});
