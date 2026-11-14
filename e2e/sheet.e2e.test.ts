import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScenePart } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { parts: ScenePart[]; project: unknown }) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[]; project: unknown };
  bomLines: () => Array<{ key: string; category: string; qty: number }>;
  printPlates: () => { open: boolean; plates: string[][] };
  lastDownload: () => { name: string; base64: string } | null;
}

const box = (id: string, name: string, position: number[], dimensions: ScenePart['dimensions']): ScenePart => ({
  id,
  name,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: position as ScenePart['position'],
  rotation: [0, 0, 0],
  dimensions,
  color: '#e4e4e7',
  note: '',
  visible: true,
  locked: false,
});

const PARTS = [
  box('shin-plate', 'Shin Plate', [0, 1.5, 0], { width: 100, height: 3, depth: 60 }),
  box('bracket', 'Bracket', [120, 15, 0], { width: 30, height: 30, depth: 30 }),
];

const call = <T>(fn: string) =>
  app.page.evaluate(
    (name) => (window as unknown as { __studio: Record<string, () => unknown> }).__studio[name]() as T,
    fn,
  );

const plate = async () => (await call<{ parts: ScenePart[] }>('sceneRecord')).parts.find((p) => p.id === 'shin-plate');
const platedIds = async () => (await call<{ plates: string[][] }>('printPlates')).plates.flat();

async function openPrint() {
  await app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await app.page.keyboard.press('Meta+p');
  await expect.poll(async () => (await call<{ open: boolean }>('printPlates')).open).toBe(true);
}

async function closePrint() {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await call<{ open: boolean }>('printPlates')).open).toBe(false);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('cut from sheet', () => {
  it('cuts a 3 mm plate from aluminum, takes it off the plates, lists it under Sheet, exports its DXF and undoes', async () => {
    await app.page.evaluate((parts) => {
      const s = (window as unknown as { __studio: Studio }).__studio;

      s.load({ parts, project: s.sceneRecord().project });
      s.select(['shin-plate']);
    }, PARTS);
    await expect.poll(() => partCount(app.page)).toBe(2);

    const appearance = app.page.locator(shown('button[aria-expanded]'), { hasText: /^Appearance$/ });

    if ((await appearance.count()) && (await appearance.getAttribute('aria-expanded')) === 'false')
      await appearance.click();

    const material = app.page.locator(shown('select[aria-label="Material"]'));

    await expect
      .poll(() => material.locator('option', { hasText: /^Cut from sheet$/ }).count(), { timeout: 20000 })
      .toBe(1);
    await material.selectOption({ label: 'Cut from sheet' });
    await app.page.locator(shown('select[aria-label="Sheet"]')).selectOption('aluminum');

    await expect.poll(async () => (await plate())?.sheet).toEqual({ material: 'aluminum', thicknessMm: 3.18 });
    expect(await app.page.locator(shown('select[aria-label="Sheet"] option:checked')).textContent()).toBe(
      '6061 aluminum 3.18 mm',
    );

    await expect
      .poll(async () =>
        (await call<Array<{ key: string; category: string; qty: number }>>('bomLines')).filter(
          (l) => l.category === 'Sheet',
        ),
      )
      .toEqual([expect.objectContaining({ key: 'sheet:aluminum|3.18', qty: 1 })]);

    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect
      .poll(() => app.page.locator(shown('button'), { hasText: /^Sheet/ }).count(), { timeout: 20000 })
      .toBe(1);

    await app.page.getByRole('button', { name: 'Export', exact: true }).click();
    await app.page.locator(shown('[role=menuitem]'), { hasText: /^Cut Files$/ }).click();
    await expect
      .poll(async () => (await call<{ name: string } | null>('lastDownload'))?.name ?? '')
      .toMatch(/-cut-files\.zip$/);

    const zip = (await call<{ base64: string }>('lastDownload')).base64;
    const files = unzipSync(Buffer.from(zip, 'base64'));

    expect(Object.keys(files)).toEqual(['Shin-Plate-6061-aluminum-3.18mm.dxf']);
    expect(strFromU8(files['Shin-Plate-6061-aluminum-3.18mm.dxf']).startsWith('0\nSECTION')).toBe(true);

    await openPrint();
    await expect.poll(platedIds, { timeout: 30000 }).toEqual(['bracket']);
    await closePrint();

    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await plate())?.sheet).toBeUndefined();

    await openPrint();
    await expect.poll(async () => (await platedIds()).sort(), { timeout: 30000 }).toEqual(['bracket', 'shin-plate']);
    await closePrint();
    expect(app.errors).toEqual([]);
  });
});
