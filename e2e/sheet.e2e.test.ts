import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

interface Studio {
  load: (record: { parts: unknown[]; project?: unknown }) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[]; project: unknown };
  printPlates: () => { open: boolean; plates: string[][] };
  lastDownload: () => { name: string; base64: string } | null;
}

const box = (id: string, position: number[], dimensions: Record<string, number>) => ({
  id,
  name: id === 'plate' ? 'Chest Plate' : 'Cube',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions,
  color: '#e4e4e7',
  note: '',
  visible: true,
  locked: false,
});

const SCENE = [
  box('plate', [0, 1.5, 0], { width: 80, height: 3, depth: 60 }),
  box('cube', [120, 10, 0], { width: 20, height: 20, depth: 20 }),
];

let app: App;

const plateSheet = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts.find((p) => p.id === 'plate')!.sheet ??
      null,
  );

const plates = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates());

const download = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('a plate cut from sheet', () => {
  it('cuts a 3 mm plate from aluminum in the Inspector, leaves the plates, lists it as sheet, exports its DXF and undoes', async () => {
    const { page } = app;

    await page.evaluate((parts) => (window as unknown as { __studio: Studio }).__studio.load({ parts }), SCENE);
    await expect.poll(() => partCount(page)).toBe(2);
    await page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.select(['plate']));

    const material = page.locator(shown('select[aria-label="Material"]')).first();
    const aluminum = material.locator('optgroup[label="Cut from Sheet"] option[value="sheet:aluminum"]');

    await expect.poll(() => aluminum.textContent(), { timeout: 20000 }).toBe('6061 aluminum, 3 mm');
    await material.selectOption('sheet:aluminum');
    await expect.poll(plateSheet).toEqual({ material: 'aluminum' });

    await page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Meta+p');
    await expect.poll(async () => (await plates()).plates, { timeout: 30000 }).toEqual([['cube']]);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await plates()).open).toBe(false);

    await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const sheetGroup = page.locator(shown('button'), { hasText: /^Sheet1/ }).first();

    await expect.poll(() => sheetGroup.count(), { timeout: 30000 }).toBe(1);
    await sheetGroup.click();
    await expect.poll(() => page.locator(shown('li'), { hasText: /^6061 aluminum3 mm/ }).count()).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Cut Files' }).click();
    await expect.poll(async () => (await download())?.name ?? '').toMatch(/-cut-files\.zip$/);

    const zip = unzipSync(Buffer.from((await download())!.base64, 'base64'));
    const dxfs = Object.keys(zip).filter((name) => name.endsWith('.dxf'));

    expect(dxfs.map((name) => name.split('/').pop())).toEqual(['chest-plate-aluminum-6061-3mm.dxf']);
    expect(new TextDecoder().decode(zip[dxfs[0]]).startsWith('0\nSECTION')).toBe(true);

    await page
      .locator('main')
      .first()
      .click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Meta+z');
    await expect.poll(plateSheet).toBeNull();
    await page.keyboard.press('Meta+p');
    await expect.poll(async () => (await plates()).plates.flat().sort(), { timeout: 30000 }).toEqual(['cube', 'plate']);
    await page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  }, 180000);
});
