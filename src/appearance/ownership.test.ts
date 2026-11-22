import * as THREE from 'three';
import { PartLayer } from '../three/viewport/partLayer';
import { afterEach, expect, it, vi } from 'vitest';
import { base64ToBytes } from '../utils/base64';
import { registerWorldAsset } from '../cases/worldAssets';
import { box } from '../sim/fixtures/parts';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { textureAsset, textureAssetHash } from './textureAsset';
import { finishAppearance } from './model';
import { prepareAppearance, textureResources } from './textures';

const png = () =>
  base64ToBytes(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMomm/2H4QZYAwAT24JGQ7yLkAAAAAASUVORK5CYII=',
  );

afterEach(() => vi.unstubAllGlobals());

async function part(index: number) {
  const bytes = new Uint8Array([...png(), index]);
  const view = new DataView(bytes.buffer);

  view.setUint32(16, 2048);
  view.setUint32(20, 2048);

  const asset = textureAsset(bytes);
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  return {
    ...box(`owned-${index}`, [0, 0, 0], [20, 20, 20], 10),
    appearance: { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } },
  };
}

it('retains concurrent preparations until material acquisition and releases stale work exactly once', async () => {
  const closed = vi.fn();

  vi.stubGlobal('createImageBitmap', async () => ({ width: 2048, height: 2048, close: closed }));

  const parts = await Promise.all([1, 2, 3].map(part));
  const first = prepareAppearance(parts.slice(0, 2));
  const second = prepareAppearance(parts.slice(2));

  await Promise.all([first.ready, second.ready]);
  expect(textureResources().pixels).toBeGreaterThanOrEqual(3 * 2048 * 2048);
  expect(closed).not.toHaveBeenCalled();

  const groups = parts.map((p) => buildPartGroup(p, false));
  const maps: unknown[] = [];

  groups.forEach((group) =>
    group.traverse((object) => {
      if ('material' in object) maps.push((object.material as { map?: unknown }).map);
    }),
  );
  expect(maps.filter(Boolean)).toHaveLength(3);
  first.release();
  first.release();
  second.release();
  expect(closed).not.toHaveBeenCalled();
  groups.forEach(releasePartGroup);
  expect(textureResources().textures).toBe(0);
  expect(textureResources().pixels).toBeLessThanOrEqual(8_388_608);
  expect(closed).toHaveBeenCalled();
});

it('refuses aggregate decoded ownership before allocating beyond the bound and propagates decode errors', async () => {
  const decode = vi.fn(async () => ({ width: 2048, height: 2048, close: vi.fn() }));

  vi.stubGlobal('createImageBitmap', decode);

  const parts = await Promise.all(Array.from({ length: 19 }, (_, i) => part(i + 10)));
  const owned = prepareAppearance(parts);

  await expect(owned.ready).rejects.toThrow('Texture memory is full.');
  owned.release();
  await Promise.allSettled([owned.ready]);
  expect(textureResources().reservedPixels).toBe(0);
  expect(textureResources().pixels).toBeLessThanOrEqual(8_388_608);
  expect(decode.mock.calls.length).toBeLessThan(19);

  vi.stubGlobal('createImageBitmap', async () => {
    throw new Error('decoder refused');
  });

  const failed = prepareAppearance([await part(99)]);

  await expect(failed.ready).rejects.toThrow('decoder refused');
  failed.release();
  expect(textureResources().reservedPixels).toBe(0);
});

it('keeps forced viewport builds and captures waiting for texture readiness and releases disposed preparations', async () => {
  let finish: () => void = () => {};
  const decoding = new Promise<void>((resolve) => {
    finish = resolve;
  });

  vi.stubGlobal('createImageBitmap', async () => {
    await decoding;

    return { width: 2048, height: 2048, close: vi.fn() };
  });

  const item = await part(120);
  const layer = new PartLayer(new THREE.Group(), () => queueMicrotask(() => layer.buildPending()));

  layer.sync([item], new Set(), 0);
  layer.buildAll();
  expect(layer.get(item.id)).toBeUndefined();

  const ready = layer.whenReady();

  finish();
  await ready;

  const mesh = layer.get(item.id)!.children[0] as THREE.Mesh;

  expect((mesh.material as THREE.MeshStandardMaterial).map).not.toBeNull();
  expect(textureResources().leases).toBe(0);
  layer.dispose();
  layer.sync([await part(121)], new Set(), 0);
  layer.dispose();
  await expect(layer.whenReady()).rejects.toMatchObject({ name: 'AbortError' });
  expect(textureResources().leases).toBe(0);
});

it('retains compiled-material identities through first finish, scalar edits and restoration', async () => {
  const original = box('persistent-material', [0, 0, 0], [20, 20, 20], 10);
  const layer = new PartLayer(new THREE.Group(), () => queueMicrotask(() => layer.buildPending()));

  layer.sync([original], new Set(), 0);
  layer.buildAll();

  const first = layer.get(original.id)!.children[0] as THREE.Mesh;
  const material = first.material as THREE.MeshStandardMaterial;
  const disposed = vi.fn();
  const native = { color: material.color.getHex(), roughness: material.roughness, metalness: material.metalness };

  material.addEventListener('dispose', disposed);

  for (const roughness of [0.3, 0.8, 0.12]) {
    const part = { ...original, appearance: { ...finishAppearance('paint', '#345678'), roughness } };

    layer.sync([part], new Set(), 0);
    await layer.whenReady();
    expect((layer.get(original.id)!.children[0] as THREE.Mesh).material).toBe(material);
    expect(material.roughness).toBe(roughness);
    expect(disposed).not.toHaveBeenCalled();
  }

  layer.sync([original], new Set(), 0);
  await layer.whenReady();
  expect((layer.get(original.id)!.children[0] as THREE.Mesh).material).toBe(material);
  expect({ color: material.color.getHex(), roughness: material.roughness, metalness: material.metalness }).toEqual(
    native,
  );
  layer.dispose();
  expect(disposed).toHaveBeenCalledOnce();
});

it('retains material identity and live projection uniforms across texture mapping edits without leaking owners', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 2048, height: 2048, close: vi.fn() }));

  const original = await part(130);
  const layer = new PartLayer(new THREE.Group(), () => queueMicrotask(() => layer.buildPending()));

  layer.sync([original], new Set(), 0);
  await layer.whenReady();

  const material = (layer.get(original.id)!.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const shader = { uniforms: {}, vertexShader: '#include <uv_vertex>' } as Parameters<
    typeof material.onBeforeCompile
  >[0];

  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

  const version = material.version;
  const next = {
    ...original,
    appearance: { ...original.appearance, mapping: { ...original.appearance.mapping, scale: 27, rotation: 42 } },
  };

  layer.sync([next], new Set(), 0);
  await layer.whenReady();
  expect((layer.get(original.id)!.children[0] as THREE.Mesh).material).toBe(material);
  expect(material.version).toBe(version);
  expect(shader.uniforms.appearanceScale.value).toBe(27);
  expect(textureResources().textures).toBe(1);
  layer.dispose();
  expect(textureResources().textures).toBe(0);
});
