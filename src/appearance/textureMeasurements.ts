import * as THREE from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';
import { box } from '../sim/fixtures/parts';
import { getTextureAsset, registerWorldAsset } from '../cases/worldAssets';
import { textureAsset, textureAssetHash } from './textureAsset';
import { finishAppearance } from './model';
import { prepareAppearance, textureResources } from './textures';

async function maximumPart(index: number) {
  const canvas = new OffscreenCanvas(2048, 2048);
  const context = canvas.getContext('2d')!;

  context.fillStyle = index ? '#675743' : '#354637';
  context.fillRect(0, 0, 2048, 2048);

  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const asset = textureAsset(bytes);
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  return {
    ...box(`max-${index}`, [0, 0, 0], [40, 40, 40], 10),
    appearance: { ...finishAppearance('paint', '#ffffff'), textures: { baseColor: hash } },
  };
}

export async function measureMaximumTextures() {
  const parts = await Promise.all([0, 1].map(maximumPart));
  const started = performance.now();
  const lease = prepareAppearance(parts);

  try {
    await lease.ready;

    const resources = textureResources();

    return {
      decodeMs: performance.now() - started,
      decodedPixels: resources.pixels,
      decodedRgbaBytes: resources.pixels * 4,
      reservedPixels: resources.reservedPixels,
      encodedBytes: parts.reduce(
        (sum, part) => sum + (getTextureAsset(part.appearance.textures.baseColor)?.texture.bytes.byteLength ?? 0),
        0,
      ),
    };
  } finally {
    lease.release();
  }
}

export function measureSharedUpload(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  part: ScenePart,
) {
  const before = renderer.info.memory.textures;
  const groups = [1, 2].map((scale) =>
    buildPartGroup(
      { ...part, appearance: { ...part.appearance!, mapping: { ...part.appearance!.mapping, scale } } },
      false,
    ),
  );

  scene.add(...groups);

  try {
    renderer.render(scene, camera);

    return renderer.info.memory.textures - before;
  } finally {
    groups.forEach((group) => {
      group.removeFromParent();
      releasePartGroup(group);
    });
  }
}
