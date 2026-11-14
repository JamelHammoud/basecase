import { describe, expect, it } from 'vitest';
import { galleryBundles } from '../gallery/galleryEntries';
import { galleryBundleBytes, parseGalleryBundle, readGalleryBundleBytes } from '../gallery/galleryBundle';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { sheetPart } from './sheet.fixtures';

const affine = [1.1, 0.2, 0, 0, 0, 1.2, 0.1, 0, 0.2, 0, 0.9, 0, 8, -3, 2, 1];
const setting = { material: 'aluminum-6061' as const, thicknessMm: 3.18 };
const changed = (index: number, value: number) => affine.map((entry, i) => (i === index ? value : entry));
const malformed = [
  { sheet: null },
  { sheet: { ...setting, material: 'steel' } },
  { sheet: { ...setting, thicknessMm: 0 } },
  { sheet: { ...setting, thicknessMm: -1 } },
  { sheet: { ...setting, thicknessMm: Infinity } },
  { sheet: { ...setting, thicknessMm: '3.18' } },
  { sheetTransform: null },
  { sheetTransform: affine.slice(1) },
  { sheetTransform: changed(0, Infinity) },
  { sheetTransform: changed(3, 0.1) },
  { sheetTransform: changed(15, 2) },
  { sheetTransform: Array.from({ length: 16 }, (_, i) => (i === 15 ? 1 : 0)) },
  { sheetTransform: changed(0, -2) },
];

function bundleWith(fields: Record<string, unknown>) {
  const bundle = galleryBundles()[0];

  return { ...bundle, robot: { ...bundle.robot, parts: [{ ...sheetPart(), ...fields }] } };
}

const sceneBytes = (fields: Record<string, unknown>) =>
  new TextEncoder().encode(
    JSON.stringify({
      format: 'basecase-scene',
      version: 1,
      scene: { name: 'Sheet', parts: [{ ...sheetPart(), ...fields }] },
    }),
  );

describe('sheet fields at import boundaries', () => {
  it('round-trips a valid sheet setting and affine transform through a scene file', async () => {
    const part = sheetPart({ sheet: setting, sheetTransform: affine });
    const bytes = await encodeSceneFile({ name: 'Sheet', globalGoal: '', annotations: [], parts: [part] });
    const scene = await decodeSceneFile(bytes);

    expect(scene.parts[0]).toEqual(part);
  });

  it('round-trips valid sheet fields through gallery serialization', () => {
    const bundle = parseGalleryBundle(bundleWith({ sheet: setting, sheetTransform: affine }));
    const read = readGalleryBundleBytes(galleryBundleBytes(bundle));

    expect(read.robot.parts[0].sheet).toEqual(setting);
    expect(read.robot.parts[0].sheetTransform).toEqual(affine);
  });

  it('keeps legacy parts without sheet fields readable', async () => {
    expect((await decodeSceneFile(sceneBytes({}))).parts[0].sheet).toBeUndefined();
    expect(parseGalleryBundle(bundleWith({})).robot.parts[0].sheet).toBeUndefined();
  });

  it.each(malformed)('refuses malformed sheet fields %j in scene files and gallery bundles', async (fields) => {
    await expect(decodeSceneFile(sceneBytes(fields))).rejects.toThrow('damaged');
    expect(() => parseGalleryBundle(bundleWith(fields))).toThrow();
  });

  it('refuses malformed sheet fields inside boolean operands at both boundaries', async () => {
    const fields = {
      boolean: { op: 'subtract', operands: [{ ...sheetPart(), sheet: { ...setting, material: 'steel' } }] },
    };

    await expect(decodeSceneFile(sceneBytes(fields))).rejects.toThrow('damaged');
    expect(() => parseGalleryBundle(bundleWith(fields))).toThrow();
  });

  it('refuses malformed sheet transforms inside custom model nodes at both boundaries', async () => {
    const fields = { customNodes: [{ part: { ...sheetPart(), sheetTransform: changed(3, 0.1) } }] };

    await expect(decodeSceneFile(sceneBytes(fields))).rejects.toThrow('damaged');
    expect(() => parseGalleryBundle(bundleWith(fields))).toThrow();
  });
});
