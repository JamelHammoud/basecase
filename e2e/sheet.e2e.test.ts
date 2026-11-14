import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: unknown) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: Array<{ id: string; sheet?: unknown }> };
  printPlates: () => { open: boolean; plates: string[][] };
  bomLines: () => Array<{ key: string; qty: number }>;
  lastDownload: () => { name: string; base64: string } | null;
}

const box = (id: string, position: number[], dimensions: Record<string, number>) => ({
  id,
  name: id === 'plate' ? 'Chest Plate' : 'Bracket',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions,
  color: '#e4e4e7',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
});

const PARTS = [
  box('plate', [0, 1.5, 0], { width: 100, height: 3, depth: 60 }),
  box('bracket', [120, 10, 0], { width: 20, height: 20, depth: 20 }),
];

const plateSheet = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts.find((p) => p.id === 'plate')?.sheet ??
      null,
  );

const printPlates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());

const printedIds = async () => (await printPlates()).plates.flat();

const lastDownload = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());

const sheetLines = () =>
  app.page.evaluate(() =>
    (window as unknown as { __studio: Studio }).__studio.bomLines().filter((l) => l.key.startsWith('sheet:')),
  );

async function togglePrintMode() {
  await app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await app.page.keyboard.press('Meta+p');
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('cut from sheet', () => {
  it('takes a 3 mm plate off the plates, lists it as sheet and exports one DXF', async () => {
    await app.page.evaluate(
      ([parts, project]) => (window as unknown as { __studio: Studio }).__studio.load({ parts, project }),
      [PARTS, DEFAULT_PROJECT] as const,
    );
    await expect.poll(() => partCount(app.page)).toBe(2);

    await togglePrintMode();
    await expect.poll(printedIds, { timeout: 60000 }).toEqual(expect.arrayContaining(['plate', 'bracket']));
    await app.page.keyboard.press('Escape');
    await expect.poll(async () => (await printPlates()).open).toBe(false);

    await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['plate']));
    await app.page.locator(shown('[role=tab]'), { hasText: 'Inspect' }).first().click();

    const material = app.page.locator(shown('select[aria-label="Material"]')).first();

    await expect.poll(() => material.locator('option', { hasText: 'Cut from sheet' }).count()).toBe(1);
    await material.selectOption({ label: 'Cut from sheet' });
    await expect.poll(plateSheet).toEqual({ material: 'aluminum', thickness: 3.18 });
    expect(await app.page.locator(shown('select[aria-label="Sheet material"]')).inputValue()).toBe('aluminum');
    expect(await app.page.locator(shown('select[aria-label="Sheet thickness"]')).inputValue()).toBe('3.18');
    expect(await sheetLines()).toEqual([{ key: 'sheet:aluminum|3.18', qty: 1 }]);

    await togglePrintMode();
    await expect.poll(printedIds, { timeout: 60000 }).toEqual(['bracket']);
    await app.page.keyboard.press('Escape');

    await app.page
      .locator(shown('button'), { hasText: /^Export$/ })
      .first()
      .click();
    await app.page.locator(shown('[role=menuitem]'), { hasText: 'Cut Files' }).first().click();
    await expect.poll(lastDownload, { timeout: 30000 }).not.toBeNull();

    const file = (await lastDownload())!;
    const entries = Object.entries(unzipSync(Buffer.from(file.base64, 'base64')));

    expect(file.name.endsWith('-cut-files.zip')).toBe(true);
    expect(entries.map(([name]) => name.split('/').pop())).toEqual(['chest-plate-6061-aluminum-3.18mm.dxf']);
    expect(strFromU8(entries[0][1]).startsWith('0\nSECTION\n')).toBe(true);

    await app.page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await app.page.keyboard.press('Meta+z');
    await expect.poll(plateSheet).toBeNull();
    expect(await sheetLines()).toEqual([]);
    expect(app.errors).toEqual([]);
  });
});
