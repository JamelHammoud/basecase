import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { colorTexture } from '../../appearance/colorTextures.fixtures';
import { finishAppearance } from '../../appearance/model';
import { textureAssetHash } from '../../appearance/textureAsset';
import { prepareAppearance, textureResources } from '../../appearance/textures';
import { registerWorldAsset } from '../../cases/worldAssets';
import { box } from '../../sim/fixtures/parts';
import { PartLayer } from './partLayer';
import { PartBatches } from './partBatches';
import { batchMaterial } from './batchKey';

it('batches opaque color maps with owned UVs, splits mappings and retains alpha and normal-map fallbacks', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 2, height: 2, close: vi.fn() }));

  const asset = colorTexture('rgb');
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const appearance = { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } };
  const parts = Array.from({ length: 4 }, (_, index) => ({
    ...box(`textured-${index}`, [index * 25, 0, 0], [20, 20, 20], 10),
    appearance,
  }));
  const lease = prepareAppearance(parts);
  const batches = new PartBatches();
  const layer = new PartLayer(new THREE.Group(), () => {}, batches);
  const world = new THREE.Scene();

  batches.attach(world);

  try {
    await lease.ready;
    layer.sync(parts, new Set(), 0);
    layer.buildPending();
    lease.release();

    const instances = () =>
      batches.root.children.filter((child): child is THREE.BatchedMesh => child instanceof THREE.BatchedMesh);
    const mesh = layer.get(parts[0].id)!.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh)!;

    expect(instances()).toHaveLength(1);
    expect(instances()[0].instanceCount).toBe(4);
    expect(instances()[0].geometry.getAttribute('uv')).toBeDefined();
    expect((instances()[0].material as THREE.MeshStandardMaterial).map).toBe(
      (mesh.material as THREE.MeshStandardMaterial).map,
    );
    expect(batchMaterial(mesh)).toBe(mesh.material);

    const material = mesh.material as THREE.MeshStandardMaterial;
    const uv = mesh.geometry.getAttribute('uv');
    const batchUv = instances()[0].geometry.getAttribute('uv') as THREE.BufferAttribute;
    const version = batchUv.version;

    uv.setXY(0, 0.2, 0.8);
    uv.needsUpdate = true;
    batches.sync();
    expect(batchUv.version).toBeGreaterThan(version);
    material.transparent = true;
    expect(batchMaterial(mesh)).toBeNull();
    material.transparent = false;
    material.normalMap = new THREE.Texture();
    expect(batchMaterial(mesh)).toBeNull();
    material.normalMap.dispose();
    material.normalMap = null;
    layer.sync(
      parts.map((part, index) =>
        index
          ? part
          : {
              ...part,
              appearance: { ...appearance, mapping: { ...appearance.mapping, scale: 25 } },
            },
      ),
      new Set(),
      0,
    );
    layer.buildPending();
    expect(instances()).toHaveLength(2);
    expect(textureResources().textures).toBe(2);
  } finally {
    lease.release();
    layer.dispose();
    batches.dispose();
    vi.unstubAllGlobals();
  }

  expect(textureResources().textures).toBe(0);
  expect(textureResources().leases).toBe(0);
});
