import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { openApp, shown, type App } from './harness';
import { plateTriangles } from '../src/sheet/sheet.fixtures';
import { detectSheet } from '../src/sheet/detectSheet';
import { binaryStl } from '../src/utils/stlBytes';
import {
  clickSupportPoint,
  pickSupportFile,
  supportCommand,
  supportDownload,
  supportField,
  supportParts,
  supportPlane,
  supportSceneStorage,
} from './sketchSupport.helpers';

let app: App;

beforeAll(async () => {
  app = await openApp();
  await supportSceneStorage(app.page);
});
afterAll(async () => {
  await app?.close();
});

async function importPlate() {
  await app.page.evaluate(() =>
    (window as unknown as { __studio: { load: (scene: { parts: never[]; name: string }) => void } }).__studio.load({
      parts: [],
      name: 'Mounting plate',
    }),
  );
  await pickSupportFile(app.page, {
    name: 'Mounting plate.stl',
    base64: Buffer.from(binaryStl(plateTriangles())).toString('base64'),
  });
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.keyboard.type('Import');
  await app.page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: 'Import' })
    .filter({ hasNotText: 'Robot' })
    .click();
  await expect.poll(async () => (await supportParts(app.page)).length).toBe(1);

  const source = (await supportParts(app.page))[0];

  await clickSupportPoint(app.page, [
    source.position[0],
    source.position[1] + source.dimensions.height / 2,
    source.position[2],
  ]);

  return source;
}

async function convertPlate() {
  const source = await importPlate();

  await supportCommand(app.page, 'Convert to Sketch');
  await expect.poll(async () => (await supportParts(app.page))[0].sketch?.mode).toBe('extrude');

  const converted = (await supportParts(app.page))[0];

  expect(converted.id).toBe(source.id);
  expect(converted.position).toEqual(source.position);
  expect(converted.sketch?.sketch.entities.every((e) => e.kind === 'line')).toBe(true);

  return converted;
}

describe('recover imported flat geometry in Sketch', () => {
  it(
    'imports, converts, edits depth, undoes, redoes and exports actual perforated geometry',
    { retry: 0 },
    async () => {
      const converted = await convertPlate();

      await app.page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await supportParts(app.page))[0].kind).toBe('mesh');
      await app.page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(async () => (await supportParts(app.page))[0].sketch?.mode).toBe('extrude');
      await clickSupportPoint(
        app.page,
        [converted.position[0], converted.position[1] + 1.5, converted.position[2]],
        true,
      );
      await supportPlane(app.page).waitFor();
      await supportField(app.page, 'Thickness', '6');
      await expect.poll(async () => (await supportParts(app.page))[0].sketch?.depth).toBe(6);
      expect((await supportParts(app.page))[0].id).toBe(converted.id);
      await app.page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await supportParts(app.page))[0].sketch?.depth).toBe(3);
      await app.page.keyboard.press('ControlOrMeta+Shift+z');
      await expect.poll(async () => (await supportParts(app.page))[0].sketch?.depth).toBe(6);
      await supportCommand(app.page, 'Export STL');
      await expect.poll(() => supportDownload(app.page)).not.toBeNull();

      const file = (await supportDownload(app.page))!;
      const bytes = Uint8Array.from(Buffer.from(file.base64, 'base64'));
      const geometry = new STLLoader().parse(bytes.buffer);
      const profile = detectSheet(geometry.getAttribute('position').array as Float32Array);

      expect(profile?.thicknessMm).toBeCloseTo(6, 4);
      expect(profile?.holes).toHaveLength(4);
      geometry.dispose();
      expect(app.errors).toEqual([]);
    },
  );

  it('saves and reopens the converted scene with ordinary Sketch editing available', { retry: 0 }, async () => {
    const converted = await convertPlate();

    await supportCommand(app.page, 'Export Scene');
    await expect.poll(async () => (await supportDownload(app.page))?.name.endsWith('.basecase')).toBe(true);

    const file = (await supportDownload(app.page))!;

    const tabs = await app.page.locator('[data-tab-close]').count();

    await pickSupportFile(app.page, file);
    await supportCommand(app.page, 'Open Scene File');
    await expect.poll(() => app.page.locator('[data-tab-close]').count()).toBe(tabs + 1);
    await expect.poll(async () => (await supportParts(app.page))[0]?.id).toBe(converted.id);
    await clickSupportPoint(
      app.page,
      [converted.position[0], converted.position[1] + 1.5, converted.position[2]],
      true,
    );
    await supportPlane(app.page).waitFor();
    await supportField(app.page, 'Thickness', '4');
    await expect.poll(async () => (await supportParts(app.page))[0].sketch?.depth).toBe(4);
    expect((await supportParts(app.page))[0].mesh).toEqual(converted.mesh);
    expect(app.errors).toEqual([]);
  });
});
