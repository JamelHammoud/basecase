import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ScenePart } from '../src/types/robotics';
import { openApp, type App } from './harness';

let app: App;

interface Studio {
  load: (record: { name: string; parts: ScenePart[] }) => void;
  select: (ids: string[]) => void;
  sceneRecord: () => { parts: ScenePart[] };
  printPlates: () => { open: boolean; plates: string[][] };
  bomLines: () => Array<{ category: string; qty: number }>;
  lastDownload: () => { name: string; base64: string } | null;
}

const PLATE: ScenePart = {
  id: 'sheet-plate',
  name: 'Mounting Plate',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 1.5, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 80, height: 3, depth: 50 },
  color: '#d4d4d4',
  mechanicalTag: '3D Printed PLA/PETG',
  note: '',
  visible: true,
  locked: false,
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;
const sceneParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().parts);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

it('cuts an aluminum plate from sheet, exports its profile and undoes the conversion', async () => {
  await app.page.evaluate((plate) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ name: 'Sheet plate', parts: [plate] });
    studio.select([plate.id]);
  }, PLATE);
  await app.page
    .locator(visible('[role=tab]'), { hasText: /^Inspect$/ })
    .first()
    .click();

  const manufacturing = app.page.locator(visible('select[aria-label="Manufacturing"]'));

  await expect.poll(() => manufacturing.count()).toBe(1);
  await manufacturing.selectOption({ label: 'Cut from Sheet' });
  await expect
    .poll(async () => (await sceneParts())[0].sheet)
    .toEqual({ material: 'aluminum-6061', thicknessMm: 3.18 });
  expect((await sceneParts())[0].dimensions.height).toBeCloseTo(3.18, 6);
  expect(await app.page.locator(visible('select[aria-label="Sheet material"]')).inputValue()).toBe('aluminum-6061');
  expect(await app.page.locator(visible('select[aria-label="Sheet thickness"]')).inputValue()).toBe('3.18');
  await expect.poll(() => app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).isDisabled()).toBe(false);
  expect(await app.page.getByRole('textbox', { name: 'Height (Y)', exact: true }).isDisabled()).toBe(true);
  expect(await app.page.getByRole('textbox', { name: 'Depth (Z)', exact: true }).isDisabled()).toBe(false);

  const lines = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.bomLines());

  expect(lines).toEqual([expect.objectContaining({ category: 'Sheet', qty: 1 })]);

  await app.page
    .locator('main')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await app.page.keyboard.press('Meta+p');
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.printPlates()))
    .toEqual({ open: true, fitTest: false, plates: [] });
  await app.page.keyboard.press('Escape');
  await app.page.getByRole('button', { name: 'Export', exact: true }).click();
  await app.page.getByRole('menuitem', { name: 'Cut Files', exact: true }).click();
  await expect
    .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload()?.name))
    .toMatch(/\.zip$/);

  const download = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.lastDownload());
  const files = unzipSync(Buffer.from(download!.base64, 'base64'));
  const dxfs = Object.entries(files).filter(([name]) => name.endsWith('.dxf'));

  expect(dxfs).toHaveLength(1);
  expect(strFromU8(dxfs[0][1]).replaceAll('\r\n', '\n')).toMatch(/^0\nSECTION\n/);

  await app.page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(sceneParts).toEqual([PLATE]);
  expect(app.errors).toEqual([]);
});

it('returns a reshaped sheet to printing with one undo restoring the sheet', async () => {
  await app.page.evaluate((plate) => {
    const studio = (window as unknown as { __studio: Studio }).__studio;

    studio.load({ name: 'Reshape sheet', parts: [plate] });
    studio.select([plate.id]);
  }, PLATE);

  const manufacturing = app.page.locator(visible('select[aria-label="Manufacturing"]'));

  await expect.poll(() => manufacturing.count()).toBe(1);
  await manufacturing.selectOption('sheet');
  await expect.poll(async () => (await sceneParts())[0].sheet?.thicknessMm).toBe(3.18);

  const sheet = (await sceneParts())[0];

  await app.page.locator(visible('button[aria-expanded="false"]'), { hasText: /^Shape$/ }).click();
  await app.page.getByRole('slider', { name: 'Taper', exact: true }).press('ArrowRight');
  await expect.poll(async () => (await sceneParts())[0].sheet).toBeUndefined();
  expect((await sceneParts())[0].mechanicalTag).toBe('3D Printed PLA/PETG');
  expect((await sceneParts())[0].deformers?.taper).toBeGreaterThan(0);
  await app.page.getByRole('button', { name: /^Undo/ }).click();
  await expect.poll(sceneParts).toEqual([sheet]);
  expect(app.errors).toEqual([]);
});
