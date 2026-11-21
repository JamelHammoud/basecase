import { programReuseChecks } from './programReuseChecks';
import { measureMaximumTextures, measureSharedUpload } from './textureMeasurements';
import * as THREE from 'three';
import { box } from '../sim/fixtures/parts';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { getTextureAsset, registerWorldAsset } from '../cases/worldAssets';
import { prepareAppearance } from './textures';
import { textureAsset, textureAssetHash, readTextureAsset, serializeTextureAsset } from './textureAsset';
import { finishAppearance, type Appearance } from './model';
import { textureResources } from './textures';

async function checker(transparent = false) {
  const canvas = new OffscreenCanvas(4, 4);
  const context = canvas.getContext('2d')!;

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 2, 2);
  context.fillStyle = '#00ff00';
  context.fillRect(2, 0, 2, 2);
  context.fillStyle = '#0000ff';
  context.fillRect(0, 2, 2, 2);
  context.fillStyle = '#ffffff';
  context.fillRect(2, 2, 2, 2);

  if (transparent) context.clearRect(0, 0, 2, 2);

  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  const asset = textureAsset(bytes);
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  return { hash, bytes: bytes.length };
}

async function damagedTextureRefused(hash: string): Promise<boolean> {
  const asset = textureAsset(getTextureAsset(hash)!.texture.bytes.slice(0, 24));

  try {
    await readTextureAsset(await textureAssetHash(asset), serializeTextureAsset(asset));

    return false;
  } catch {
    return true;
  }
}

export async function appearanceRenderChecks() {
  const start = performance.now();
  const { hash, bytes } = await checker();
  const appearance = {
    ...finishAppearance('matte', '#ffffff'),
    mapping: { kind: 'uv' as const, plane: 'xy' as const, scale: 1, rotation: 0 },
    textures: { baseColor: hash },
  };
  const part = { ...box('checker', [0, 0, 0], [40, 40, 40], 10), appearance };

  const prepared = prepareAppearance([part]);

  await prepared.ready;
  prepared.release();

  const preparationMs = performance.now() - start;
  const renderer = new THREE.WebGLRenderer({ canvas: new OffscreenCanvas(64, 64), antialias: false });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 200);

  renderer.setSize(64, 64, false);
  renderer.toneMapping = THREE.NoToneMapping;
  scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);

  const draw = (finish: Appearance) => {
    const group = buildPartGroup({ ...part, appearance: finish }, false);

    group.traverse((object) => {
      if (object instanceof THREE.LineSegments) object.visible = false;
    });
    scene.add(group);
    renderer.render(scene, camera);

    const pixels = new Uint8Array(64 * 64 * 4);

    renderer
      .getContext()
      .readPixels(0, 0, 64, 64, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels);
    group.removeFromParent();
    releasePartGroup(group);

    return Array.from(pixels);
  };

  try {
    draw({ ...appearance, textures: undefined });

    const baselineTextures = renderer.info.memory.textures;
    const uv = draw(appearance);
    const planar = draw({ ...appearance, mapping: { kind: 'planar', plane: 'xy', scale: 40, rotation: 0 } });
    const scaled = draw({ ...appearance, mapping: { ...appearance.mapping, scale: 0.5 } });
    const rotated = draw({ ...appearance, mapping: { ...appearance.mapping, rotation: 90 } });

    const drawCalls = renderer.info.render.calls;
    const sharedUploads = measureSharedUpload(renderer, scene, camera, part);
    const resources = textureResources();
    const maximum = await measureMaximumTextures();
    const programReuse = await programReuseChecks(renderer, scene, camera, part);
    const { hash: alphaHash } = await checker(true);
    const alphaAppearance = { ...appearance, textures: { baseColor: alphaHash } };
    const alphaLease = prepareAppearance([{ ...part, appearance: alphaAppearance }]);

    await alphaLease.ready;
    scene.background = new THREE.Color('#ff00ff');

    const alpha = draw(alphaAppearance);

    alphaLease.release();

    return {
      alpha,
      maximum,
      programReuse,
      sharedUploads,
      uv,
      planar,
      scaled,
      rotated,
      malformedRefused: await damagedTextureRefused(hash),
      preparationMs,
      bytes,
      drawCalls,
      gpuTextures: renderer.info.memory.textures - baselineTextures,
      resources,
    };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
