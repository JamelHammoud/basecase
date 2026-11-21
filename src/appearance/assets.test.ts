import { fixtureRobots } from '../sim/fixtures/robots';
import { buildCase, builderRobot } from '../cases/caseBuilder';
import { buildRig } from '../utils/kinematics';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { sameTextureRequest } from '../components/inspector/textureImportRequest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { componentMeshesReady, provideMeshFiles, textureMeshFiles } from '../three/componentMeshes';
import { PartLayer } from '../three/viewport/partLayer';
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { box } from '../sim/fixtures/parts';
import {
  getTextureAsset,
  registerWorldAsset,
  restoreWorldAssets,
  sceneAssets,
  serializeWorldAssets,
} from '../cases/worldAssets';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { sceneJson } from '../utils/sceneJson';
import { base64ToBytes } from '../utils/base64';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { prepareAppearance } from './textures';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../workspace/docHistory';
import { DEFAULT_PROJECT } from '../types/robotics';
import { acquireTexture, importTexture, textureResources } from './textures';
import {
  textureAsset,
  textureAssetHash,
  readTextureAsset,
  serializeTextureAsset,
  MAX_TEXTURE_BYTES,
} from './textureAsset';
import { editAppearance, finishAppearance } from './model';

const png = () =>
  base64ToBytes(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMomm/2H4QZYAwAT24JGQ7yLkAAAAAASUVORK5CYII=',
  );
const bitmap = () => ({ width: 2, height: 2, close: vi.fn() });

const leases: Array<ReturnType<typeof prepareAppearance>> = [];

async function prepareParts(parts: Parameters<typeof prepareAppearance>[0]) {
  const lease = prepareAppearance(parts);

  leases.push(lease);
  await lease.ready;
}

afterEach(() => {
  leases.splice(0).forEach((lease) => lease.release());
  vi.unstubAllGlobals();
});

it('deduplicates content through portable, ordinary and history round trips', async () => {
  const asset = textureAsset(png());
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const appearance = {
    ...finishAppearance('paint', '#ffffff'),
    textures: { baseColor: hash, normal: hash, roughnessMetalness: hash },
  };
  const originals = [box('left', [0, 10, 0], [20, 20, 20], 10), box('right', [30, 10, 0], [20, 20, 20], 10)];
  const parts = originals.map((part) => ({ ...part, appearance }));
  const unused = textureAsset(new Uint8Array([...png(), 5]));
  const unusedHash = await textureAssetHash(unused);
  const saved = sharedScene({
    name: 'Gripper',
    globalGoal: '',
    parts,
    worldAssets: serializeWorldAssets({ [hash]: asset, [unusedHash]: unused }),
  });
  const portable = await decodeSceneFile(await encodeSceneFile(saved));
  const ordinary = JSON.parse(await sceneJson({ parts }));

  expect(Object.keys(portable.worldAssets!)).toEqual([hash]);
  expect(ordinary.worldAssets).toEqual(portable.worldAssets);
  expect(portable.parts).toEqual(parts);
  expect(getTextureAsset(hash)?.texture.bytes).toEqual(png());

  const edited = pushHistory(docFromParts(originals), parts, trackedOf(DEFAULT_PROJECT));
  const undone = travelProject(edited, DEFAULT_PROJECT, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

  expect(undone.doc.parts).toBe(originals);
  expect(redone.doc.parts).toBe(parts);
  expect(redone.project.joints).toBe(DEFAULT_PROJECT.joints);
});

it('refuses malformed, oversized, forged and remote data before registering assets', async () => {
  const asset = textureAsset(png());
  const hash = await textureAssetHash(asset);
  const encoded = serializeTextureAsset(asset);
  const fetcher = vi.fn();

  vi.stubGlobal('fetch', fetcher);

  const huge = png();
  const header = new DataView(huge.buffer);

  header.setUint32(16, 4096);
  header.setUint32(20, 4096);
  expect(() => textureAsset(huge)).toThrow('4 million pixels');
  expect(() => textureAsset(new Uint8Array(MAX_TEXTURE_BYTES + 1))).toThrow('8 MB');
  expect(() => textureAsset(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow();
  await expect(readTextureAsset('0'.repeat(64), encoded)).rejects.toThrow('hash');
  await expect(
    readTextureAsset(hash, { texture: { bytes: 'https://example.com/image.png', mimeType: 'image/png' } }),
  ).rejects.toThrow();
  await expect(
    restoreWorldAssets({ [hash]: { texture: { ...encoded.texture, mimeType: 'image/jpeg' } } }),
  ).rejects.toThrow('hash');
  expect(fetcher).not.toHaveBeenCalled();
});

it('shares GPU maps, keeps color and data spaces separate and disposes the last owner', async () => {
  const decoded = bitmap();

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => decoded),
  );

  const asset = textureAsset(png());
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const appearance = {
    ...finishAppearance('matte', '#ffffff'),
    normalY: -1 as const,
    textures: { baseColor: hash, normal: hash, roughnessMetalness: hash },
  };
  const part = { ...box('cover', [0, 10, 0], [20, 20, 20], 10), appearance };

  await prepareParts([part]);

  const first = buildPartGroup(part, false);
  const second = buildPartGroup({ ...part, id: 'other' }, false);
  const a = (first.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const b = (second.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

  expect(a.map).toBe(b.map);

  const sourceVersion = a.map!.source.version;
  const variant = acquireTexture(hash, { ...appearance, mapping: { ...appearance.mapping, scale: 17 } }, true)!;

  expect(variant.texture).not.toBe(a.map);
  expect(variant.texture.source).toBe(a.map!.source);
  expect(variant.texture.source.version).toBe(sourceVersion);
  variant.release();
  expect(a.map!.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(a.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
  expect(a.roughnessMap).toBe(a.metalnessMap);
  expect(a.map).not.toBe(a.normalMap);
  expect(a.normalScale.y).toBe(-1);

  const disposed = vi.fn();

  a.map!.addEventListener('dispose', disposed);
  releasePartGroup(first);
  expect(disposed).not.toHaveBeenCalled();
  releasePartGroup(second);
  expect(disposed).toHaveBeenCalledOnce();
  expect(textureResources().textures).toBe(0);
});

it('keeps missing textures and unsupported UVs as geometry-preserving scalar finishes', () => {
  const part = box('cover', [0, 10, 0], [20, 20, 20], 10);
  const appearance = { ...finishAppearance('metal', '#112233'), textures: { baseColor: 'f'.repeat(64) } };
  const plain = buildPartGroup(part, false);
  const finished = buildPartGroup({ ...part, appearance }, false);
  const a = plain.children[0] as THREE.Mesh;
  const b = finished.children[0] as THREE.Mesh;

  expect(b.geometry.getAttribute('position').array).toEqual(a.geometry.getAttribute('position').array);
  expect((b.material as THREE.MeshStandardMaterial).map).toBeNull();
  expect(Object.keys(sceneAssets(undefined, [{ ...part, appearance }]))).toEqual([]);
  releasePartGroup(plain);
  releasePartGroup(finished);
});

it('discards prepared bytes and bitmaps after cancellation', async () => {
  const decoded = bitmap();

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => decoded),
  );

  expect(await importTexture(new Blob([png() as BlobPart]), () => false)).toBeNull();
  expect(decoded.close).toHaveBeenCalledOnce();
});

it('edits independent values and UV transforms without replacing other finish fields', async () => {
  const asset = textureAsset(png());
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap()),
  );

  const part = {
    ...box('uv-cover', [0, 10, 0], [20, 20, 20], 10),
    appearance: finishAppearance('transparent', '#ffffff'),
  };
  const appearance = editAppearance(part, {
    roughness: 0.77,
    textures: { baseColor: hash },
    mapping: { kind: 'uv', scale: 4, rotation: 90 },
  });

  await prepareParts([{ ...part, appearance }]);

  const owned = acquireTexture(hash, appearance, true)!;

  expect(appearance.metalness).toBe(part.appearance.metalness);
  expect(appearance.opacity).toBe(part.appearance.opacity);
  expect(owned.texture.repeat.toArray()).toEqual([0.25, 0.25]);
  expect(owned.texture.rotation).toBeCloseTo(Math.PI / 2);
  owned.release();
  expect(Object.keys(serializeWorldAssets(sceneAssets(undefined, [{ ...part, appearance }])))).toEqual([hash]);
});

it('retains unchanged repeated parts while applying a two-part finish transaction', () => {
  const parts = Array.from({ length: 100 }, (_, index) =>
    box(`module-${index}`, [index * 25, 10, 0], [20, 20, 20], 10),
  );
  const layer = new PartLayer(new THREE.Group());

  layer.sync(parts, new Set(), 0);
  layer.buildAll();

  const groups = parts.map((part) => layer.get(part.id));
  const next = parts.map((part, index) =>
    index < 2 ? { ...part, appearance: finishAppearance('metal', part.color) } : part,
  );
  const started = performance.now();

  layer.sync(next, new Set(), 0);
  layer.buildAll();

  const editMs = performance.now() - started;

  expect(layer.get(parts[0].id)).not.toBe(groups[0]);
  expect(layer.get(parts[1].id)).not.toBe(groups[1]);

  for (let index = 2; index < parts.length; index++) expect(layer.get(parts[index].id)).toBe(groups[index]);

  mkdirSync('scratch', { recursive: true });
  writeFileSync(
    'scratch/appearance-edit-metrics.json',
    JSON.stringify({ materialEditCpuMs: editMs, totalParts: parts.length, retainedParts: parts.length - 2 }),
  );
  layer.dispose();
});

it('prepares deduplicated Blob entries in rendering without treating them as remote component ids', async () => {
  const bytes = new Uint8Array([...png(), 17, 23]);
  const source = textureAsset(bytes);
  const hash = await textureAssetHash(source);
  const reading = vi.spyOn(source.encoded, 'arrayBuffer');
  const fetcher = vi.fn();
  const files = { [`texture:${hash}`]: source.encoded };

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap()),
  );
  vi.stubGlobal('fetch', fetcher);
  provideMeshFiles(files);
  expect(reading).not.toHaveBeenCalled();
  expect(await componentMeshesReady(Object.keys(files))).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();

  const part = {
    ...box('blob-cover', [0, 10, 0], [20, 20, 20], 10),
    appearance: { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } },
  };

  await prepareParts([part]);
  expect(reading).toHaveBeenCalledOnce();
  expect(getTextureAsset(hash)?.texture.bytes).toEqual(bytes);
  expect(Object.keys(textureMeshFiles([part, { ...part, id: 'repeated' }]))).toEqual([`texture:${hash}`]);
  expect(textureMeshFiles([part])[`texture:${hash}`]).toBeInstanceOf(Blob);

  const group = buildPartGroup(part, false);

  expect(((group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).map).not.toBeNull();
  releasePartGroup(group);
});

it('imports through recreated selection arrays and cancels after the selected immutable record changes', async () => {
  vi.stubGlobal('createImageBitmap', async () => bitmap());

  const part = box('request-cover', [0, 0, 0], [20, 20, 20], 10);
  const source = { parts: [part], sceneParts: [part] };
  let current = { parts: [...source.parts], sceneParts: [...source.sceneParts] };
  const live = () => sameTextureRequest(source, current);

  expect(await importTexture(new Blob([png()]), live)).toMatch(/^[a-f0-9]{64}$/);

  const pending = importTexture(new Blob([png()]), live);

  current = { parts: [{ ...part, appearance: finishAppearance('rubber', '#111111') }], sceneParts: source.sceneParts };
  expect(await pending).toBeNull();
});

it('retains and validates textures owned by a captured Case after its scene source is removed', async () => {
  const asset = textureAsset(png());
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const target = {
    ...selectedPickTargets()[0],
    appearance: { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } },
  };
  const built = buildCase(
    { goal: 'pick', world: 'floor', pickTarget: target },
    builderRobot(buildRig(arm.joints, arm.parts), arm.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  const project = { ...DEFAULT_PROJECT, joints: arm.joints, cases: [built.kase] };
  const record = sharedScene({ name: 'Captured finish', globalGoal: '', parts: arm.parts, project });
  const ordinary = JSON.parse(await sceneJson({ name: record.name, parts: arm.parts, project }));
  const opened = await decodeSceneFile(await encodeSceneFile(record));

  expect(Object.keys(ordinary.worldAssets)).toContain(hash);
  expect(Object.keys(opened.worldAssets!)).toContain(hash);

  const damaged = structuredClone(record);
  const captured = damaged.project!.cases![0].world.objects.find((object) => object.geometry)!;

  Object.assign(captured.geometry!.appearance!.mapping, { plane: 'xy; for (;;) {}' });
  await expect(decodeSceneFile(await encodeSceneFile(damaged))).rejects.toThrow();
});
