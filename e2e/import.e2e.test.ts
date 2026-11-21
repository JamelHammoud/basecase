import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OBJ_MODEL, OBJ_MATERIALS, glbModel, fbxModel } from '../src/utils/modelMesh.fixtures';
import { DAE_MODEL, PLY_MODEL, threeMfModel } from '../src/utils/modelFormats.fixtures';
import { dracoModel, meshoptModel } from '../src/utils/modelCompressed.fixtures';
import type { ScenePart } from '../src/types/robotics';
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
  await paletteRow('Import')
    .filter({ hasNotText: /Robot|World/ })
    .click();
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
    expect(
      await paletteRow('Import')
        .filter({ hasNotText: /Robot|World/ })
        .count(),
    ).toBe(1);
    await app.page.keyboard.press('Escape');
  });

  it('turns an STL into a part', async () => {
    const before = await partCount(app.page);

    await importFromPalette({ 'bracket.stl': stl() });

    await expect.poll(() => partCount(app.page), { timeout: 30000 }).toBe(before + 1);
  });

  it.each(['obj', 'fbx', 'glb'])('drops a local %s as separate colored parts', async (ext) => {
    const contents = { obj: strToU8(OBJ_MODEL), fbx: strToU8(fbxModel()), glb: glbModel() };
    const before = await partCount(app.page);
    const files = [{ name: `assembly.${ext}`, base64: base64(contents[ext as keyof typeof contents]) }];

    if (ext === 'obj') files.push({ name: 'colors.mtl', base64: base64(strToU8(OBJ_MATERIALS)) });

    await app.page.evaluate(
      (list) => (window as unknown as { __studio: { dropFiles: (f: typeof list) => void } }).__studio.dropFiles(list),
      files,
    );
    await expect.poll(() => partCount(app.page)).toBe(before + 2);

    const parts = await app.page.evaluate(() =>
      (window as unknown as { __studio: { sceneRecord: () => { parts: ScenePart[] } } }).__studio
        .sceneRecord()
        .parts.slice(-2),
    );

    expect(parts.map((p) => p.name)).toEqual(['Left', 'Right']);
    expect(parts.map((p) => p.color)).toEqual(['#ff0000', '#00ff00']);
    expect(parts[0].group).toEqual(parts[1].group);
    expect(await app.page.locator(shown('[data-testid="new-case"]')).count()).toBe(0);
  });

  it.each(['3mf', 'ply', 'dae'])('imports a local %s with every triangle', async (ext) => {
    const contents = { '3mf': threeMfModel(), ply: strToU8(PLY_MODEL), dae: strToU8(DAE_MODEL) };
    const before = await partCount(app.page);

    await importFromPalette({ [`triangle.${ext}`]: contents[ext as keyof typeof contents] });
    await expect.poll(() => partCount(app.page)).toBe(before + 1);

    const part = await app.page.evaluate(() =>
      (window as unknown as { __studio: { sceneRecord: () => { parts: ScenePart[] } } }).__studio
        .sceneRecord()
        .parts.at(-1),
    );

    expect(part?.mesh?.indices).toHaveLength(3);
    expect(part?.dimensions).toEqual({ width: 10, height: 10, depth: ext === 'dae' ? 20 : 10 });
  });

  it.each(['Draco', 'Meshopt'])('imports %s-compressed GLB using bundled decoders', async (compression) => {
    const before = await partCount(app.page);
    const bytes = compression === 'Draco' ? dracoModel() : await meshoptModel();

    await importFromPalette({ 'compressed.glb': bytes });
    await expect.poll(() => partCount(app.page)).toBe(before + (compression === 'Draco' ? 1 : 2));
  });

  it('imports glTF with its selected local BIN companion', async () => {
    const before = await partCount(app.page);
    const bytes = glbModel();
    const length = new DataView(bytes.buffer).getUint32(12, true);
    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));

    document.buffers[0].uri = 'assembly.bin';
    await importFromPalette({
      'assembly.gltf': strToU8(JSON.stringify(document)),
      'assembly.bin': bytes.slice(28 + length),
    });
    await expect.poll(() => partCount(app.page)).toBe(before + 2);
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
