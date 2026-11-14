import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: ScenePart[]; project: unknown }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: unknown };
  select: (ids: string[]) => void;
  printPlates: () => { open: boolean; plates: string[][] };
  bomLines: () => Array<{ key: string; category: string; qty: number }>;
  lastDownload: () => { name: string; base64: string } | null;
}

const printed = (id: string, name: string, dimensions: ScenePart['dimensions'], x: number): ScenePart => ({
  id,
  name,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [x, dimensions.height / 2, 0],
  rotation: [0, 0, 0],
  dimensions,
  color: '#e4e4e7',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
});

const PARTS = [
  printed('shin-plate', 'Shin Plate', { width: 60, height: 3, depth: 40 }, 0),
  printed('hip-block', 'Hip Block', { width: 30, height: 30, depth: 30 }, 80),
];

const sceneParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);
const plate = async () => (await sceneParts()).find((p) => p.id === 'shin-plate')!;
const printPlates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());
const plated = async () => (await printPlates()).plates.flat();
const bomLines = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bomLines());
const lastDownload = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());

const focusCanvas = () =>
  app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });

async function platesWith(id: string, expected: boolean) {
  await focusCanvas();
  await app.page.keyboard.press('Meta+p');
  await expect.poll(async () => (await plated()).includes('hip-block'), { timeout: 30000 }).toBe(true);
  await expect.poll(async () => (await plated()).includes(id), { timeout: 30000 }).toBe(expected);
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await printPlates()).open).toBe(false);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Cut from Sheet', () => {
  it('cuts a 3 mm plate from aluminum, takes it off the plates, lists it under Sheet and exports its DXF', async () => {
    await app.page.evaluate((parts) => {
      const s = (window as unknown as { __studio: Studio }).__studio;

      s.load({ parts, project: s.sceneRecord().project });
    }, PARTS);
    await expect.poll(() => partCount(app.page)).toBe(PARTS.length);
    await platesWith('shin-plate', true);

    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['shin-plate']));

    const material = app.page.locator(shown('select[aria-label="Material"]'));

    await expect.poll(() => material.locator('option[value="sheet"]').count(), { timeout: 15000 }).toBe(1);
    await material.selectOption('sheet');
    await expect.poll(async () => (await plate()).sheet).toEqual({ material: 'aluminum', thicknessMm: 3 });
    expect(await app.page.locator(shown('select[aria-label="Sheet"]')).inputValue()).toBe('aluminum');

    await platesWith('shin-plate', false);
    expect((await bomLines()).filter((l) => l.category === 'Sheet')).toEqual([
      { key: 'sheet:aluminum|3', category: 'Sheet', qty: 1 },
    ]);
    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const bom = app.page.locator(shown('section'), { hasText: /^Bill of materials/ }).first();

    await expect
      .poll(() => bom.locator(shown('button[aria-expanded]'), { hasText: /^Sheet\d/ }).count(), { timeout: 20000 })
      .toBe(1);

    await app.page.getByRole('button', { name: 'Export', exact: true }).click();
    await app.page.getByRole('menuitem', { name: 'Cut Files' }).click();
    await expect.poll(async () => (await lastDownload())?.name).toMatch(/-cut-files\.zip$/);

    const zip = (await lastDownload())!;
    const files = unzipSync(Buffer.from(zip.base64, 'base64'));

    expect(Object.keys(files)).toEqual(['shin-plate-aluminum-3mm.dxf']);
    expect(strFromU8(files['shin-plate-aluminum-3mm.dxf']).startsWith('0\nSECTION')).toBe(true);

    await focusCanvas();
    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await plate()).sheet).toBeUndefined();
    await platesWith('shin-plate', true);
    expect(app.errors).toEqual([]);
  }, 180000);
});
