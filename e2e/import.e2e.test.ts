import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../src/types/robotics';
import { deskArmFiles, deskArmZip } from '../src/utils/robotImport/robotImport.fixtures';
import { openApp, partCount, shown, type App } from './harness';

let app: App;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60"/></svg>';

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const stl = () => Object.entries(deskArmFiles()).find(([path]) => path.endsWith('.stl'))![1];

const jointCount = () =>
  app.page.evaluate(
    () =>
      (window as unknown as { __studio: { sceneRecord: () => { project: ProjectSettings } } }).__studio.sceneRecord()
        .project.joints?.length ?? 0,
  );

const paletteRow = (label: string) => app.page.locator(shown('button[data-idx]')).filter({ hasText: label });

async function importFromPalette(files: Record<string, Uint8Array>) {
  const picked = Object.entries(files).map(([name, bytes]) => ({ name, base64: base64(bytes) }));

  await app.page.evaluate(
    (list) => (window as unknown as { __studio: { pickFiles: (f: typeof list) => void } }).__studio.pickFiles(list),
    picked,
  );
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Import');
  await paletteRow('Import').filter({ hasNotText: 'Robot' }).click();
}

const robotSheet = () => app.page.getByRole('dialog', { name: 'Import Robot' });

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Import', () => {
  it('replaces Import Mesh, Import SVG and Import BVH in ⌘K', async () => {
    await app.page.keyboard.press('Meta+k');

    for (const gone of ['Import Mesh', 'Import SVG', 'Import BVH']) {
      await app.page.keyboard.press('ControlOrMeta+a');
      await app.page.keyboard.type(gone);
      expect(await paletteRow(gone).count(), gone).toBe(0);
    }

    await app.page.keyboard.press('ControlOrMeta+a');
    await app.page.keyboard.type('Import');
    expect(await paletteRow('Import').filter({ hasNotText: 'Robot' }).count()).toBe(1);
    await app.page.keyboard.press('Escape');
  });

  it('turns an STL into a part', async () => {
    const before = await partCount(app.page);

    await importFromPalette({ 'bracket.stl': stl() });

    await expect.poll(() => partCount(app.page), { timeout: 30000 }).toBe(before + 1);
  });

  it('opens the extrude panel with an SVG loaded', async () => {
    await importFromPalette({ 'plate.svg': strToU8(SVG) });

    await expect.poll(() => app.page.locator(shown('h2'), { hasText: 'Import SVG' }).count()).toBe(1);
    await expect.poll(() => app.page.locator(shown('button'), { hasText: 'Edit in Sketch' }).count()).toBe(1);
  });

  it('imports a robot zip at once, without a sheet', async () => {
    const before = await jointCount();

    await importFromPalette({ 'desk_arm.zip': deskArmZip() });

    await expect.poll(jointCount, { timeout: 30000 }).toBe(before + 2);
    expect(await robotSheet().count()).toBe(0);
  });

  it('names a file it can’t read in one toast', async () => {
    await importFromPalette({ 'notes.txt': strToU8('hello') });

    await expect
      .poll(() => app.page.getByRole('status').filter({ hasText: 'Couldn’t import notes.txt' }).count())
      .toBe(1);
  });
});
