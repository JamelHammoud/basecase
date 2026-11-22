import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { textureAsset, textureAssetHash } from '../../appearance/textureAsset';
import { finishAppearance } from '../../appearance/model';
import { textureResources } from '../../appearance/textures';
import { registerWorldAsset } from '../../cases/worldAssets';
import { box } from '../../sim/fixtures/parts';
import { base64ToBytes } from '../../utils/base64';
import { readyCapture, readyMeshes } from './captureReadiness';
import { PartLayer } from './partLayer';

afterEach(() => vi.unstubAllGlobals());

it('waits for Case world texture acquisition before reporting mesh or capture readiness', async () => {
  let decode: () => void = () => {};
  const decoding = new Promise<void>((resolve) => {
    decode = resolve;
  });

  vi.stubGlobal('createImageBitmap', async () => {
    await decoding;

    return { width: 2, height: 2, close: vi.fn() };
  });

  const asset = textureAsset(
    base64ToBytes(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMomm/2H4QZYAwAT24JGQ7yLkAAAAAASUVORK5CYII=',
    ),
  );
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const part = {
    ...box('captured-object', [0, 0, 0], [20, 20, 20], 10),
    appearance: { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } },
  };
  const context = { layer: new PartLayer(new THREE.Group()), world: new PartLayer(new THREE.Group()) };
  const complete = vi.fn();
  const capture = vi.fn(() => {
    const mesh = context.world.get(part.id)!.children[0] as THREE.Mesh;

    expect((mesh.material as THREE.MeshStandardMaterial).map).not.toBeNull();

    return 'captured';
  });
  const meshesReady = vi.fn();

  context.world.sync([part], new Set(), 0);

  try {
    const pendingCapture = readyCapture(context, complete, capture);
    const pendingMeshes = readyMeshes(context, []).then(meshesReady);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(capture).not.toHaveBeenCalled();
    expect(meshesReady).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    decode();
    expect(await pendingCapture).toBe('captured');
    await pendingMeshes;
    expect(complete).toHaveBeenCalledOnce();
    expect(meshesReady).toHaveBeenCalledExactlyOnceWith([]);
    expect(textureResources().leases).toBe(0);
  } finally {
    decode();
    context.layer.dispose();
    context.world.dispose();
  }
});
