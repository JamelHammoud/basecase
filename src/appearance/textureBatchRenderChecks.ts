import * as THREE from 'three';
import { colorTexture } from './colorTextures.fixtures';
import { textureAssetHash } from './textureAsset';
import { registerWorldAsset } from '../cases/worldAssets';
import { prepareAppearance, textureResources } from './textures';
import { finishAppearance, type Appearance } from './model';
import { box } from '../sim/fixtures/parts';
import { PartLayer } from '../three/viewport/partLayer';
import { PartBatches } from '../three/viewport/partBatches';

function pixels(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  renderer.render(scene, camera);

  const result = new Uint8Array(64 * 64 * 4);
  const gl = renderer.getContext();

  gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, result);

  return result;
}

async function compare(renderer: THREE.WebGLRenderer, mapping: Appearance['mapping'], alpha = false) {
  const asset = colorTexture(alpha ? 'rgba' : 'rgb');
  const hash = await textureAssetHash(asset);

  registerWorldAsset(hash, asset);

  const parts = ['#ffffff', '#ffb0a0', '#a0ffb0', '#a0b0ff'].map((color, index) => ({
    ...box(`painted-${index}`, [-36 + index * 24, 0, 0], [16, 16, 16], 10),
    appearance: {
      ...finishAppearance('paint', color),
      mapping: index === 3 ? { ...mapping, scale: mapping.scale * 2 } : mapping,
      textures: { baseColor: hash },
    },
  }));
  const lease = prepareAppearance(parts);
  const batches = new PartBatches();
  const root = new THREE.Group();
  const layer = new PartLayer(root, () => {}, batches);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-50, 50, 25, -25, 0.1, 200);

  scene.background = new THREE.Color('#ff00ff');
  scene.add(root, new THREE.AmbientLight(0xffffff, 1));
  camera.position.z = 100;
  camera.lookAt(0, 0, 0);
  batches.attach(scene);

  try {
    await lease.ready;
    layer.sync(parts, new Set(), 0);
    layer.buildPending();
    lease.release();
    scene.updateMatrixWorld(true);

    const original = batches.unbatched(() => pixels(renderer, scene, camera));
    const batched = pixels(renderer, scene, camera);
    const meshes = batches.root.children.filter(
      (child): child is THREE.BatchedMesh => child instanceof THREE.BatchedMesh,
    );
    const differing = batched.reduce((sum, value, index) => sum + Number(Math.abs(value - original[index]) > 4), 0);

    return {
      alpha,
      mapping: mapping.kind,
      difference: differing / batched.length,
      instances: meshes.reduce((sum, mesh) => sum + mesh.instanceCount, 0),
      batches: meshes.length,
      drawCalls: renderer.info.render.calls,
    };
  } finally {
    lease.release();
    layer.dispose();
    batches.dispose();
  }
}

export async function textureBatchRenderChecks(renderer: THREE.WebGLRenderer) {
  const states = [];

  for (const mapping of [
    { kind: 'uv' as const, plane: 'xy' as const, scale: 1, rotation: 0 },
    { kind: 'planar' as const, plane: 'xy' as const, scale: 20, rotation: 0 },
    { kind: 'planar' as const, plane: 'xy' as const, scale: 10, rotation: 45 },
  ])
    states.push(await compare(renderer, mapping));

  states.push(await compare(renderer, { kind: 'uv', plane: 'xy', scale: 1, rotation: 0 }, true));

  return { states, resources: textureResources() };
}
