import { prepareAppearance } from './textures';
import type { ScenePart } from '../types/robotics';
import * as THREE from 'three';
import { PartLayer } from '../three/viewport/partLayer';
import { box } from '../sim/fixtures/parts';
import { finishAppearance } from './model';

export async function programReuseChecks(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  textured: ScenePart,
) {
  const root = new THREE.Group();
  const layer = new PartLayer(root, () => {}, null, renderer);
  const original = box('program-reuse', [0, 0, 0], [40, 40, 40], 10);
  const selected = new Set([original.id]);
  const programs = () => renderer.info.programs?.map((program) => program.id) ?? [];

  scene.add(root);
  layer.sync([original], selected, 0);
  layer.buildAll();
  renderer.render(scene, camera);

  const initial = programs();
  const start = performance.now();
  const results: number[][] = [];

  try {
    for (const appearance of [finishAppearance('paint', '#ffffff'), finishAppearance('rubber', '#223344'), undefined]) {
      layer.sync([{ ...original, appearance }], selected, 0);
      layer.buildAll();
      renderer.render(scene, camera);
      results.push(programs());
    }

    const appearance = {
      ...textured.appearance!,
      mapping: { kind: 'planar' as const, plane: 'xy' as const, scale: 40, rotation: 0 },
    };
    const mapped = { ...original, appearance };
    const lease = prepareAppearance([mapped]);

    await lease.ready;
    layer.sync([mapped], selected, 0);
    await layer.whenReady();
    renderer.render(scene, camera);
    lease.release();

    const mesh = layer.get(original.id)!.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const textureHandle = (renderer.properties.get(material.map!) as { __webglTexture?: WebGLTexture }).__webglTexture;
    const texturedPrograms = programs();

    layer.sync(
      [{ ...mapped, appearance: { ...appearance, mapping: { ...appearance.mapping, scale: 27, rotation: 42 } } }],
      selected,
      0,
    );
    await layer.whenReady();
    renderer.render(scene, camera);

    return {
      initial,
      results,
      editsMs: performance.now() - start,
      texturedPrograms,
      mappedPrograms: programs(),
      sharedHandle:
        !!textureHandle &&
        textureHandle === (renderer.properties.get(material.map!) as { __webglTexture?: WebGLTexture }).__webglTexture,
    };
  } finally {
    layer.dispose();
    root.removeFromParent();
  }
}
