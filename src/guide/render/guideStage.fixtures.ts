import * as THREE from 'three';
import { GuideStage, type StagePart } from './guideStage';
import { GUIDE_NEIGHBORS } from './guideNeighbors';
import { drawReference } from './guideReference.fixtures';
import { idMaterial, toonMaterial } from './guideShaders';

export async function probeGuideStage(angle = 0) {
  const stage = new GuideStage();
  const toon = toonMaterial();
  const id = idMaterial();
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const mesh = new THREE.Mesh(geometry, toon);
  const group = new THREE.Group().add(mesh);
  const part: StagePart = { group, meshes: [{ mesh, toon }], idMaterial: id, index: 1 };
  const ringGeometry = new THREE.TorusGeometry(0.7, 0.16, 6, 16);
  const ghost = toonMaterial();
  const ghostId = idMaterial();
  const ring = new THREE.Mesh(ringGeometry, ghost);
  const ringGroup = new THREE.Group().add(ring);
  const parts: StagePart[] = [
    part,
    { group: ringGroup, meshes: [{ mesh: ring, toon: ghost }], idMaterial: ghostId, index: 2 },
  ];
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);

  camera.position.set(Math.sin(angle) * 10, 5, Math.cos(angle) * 10);
  camera.lookAt(0, 0, 0);
  id.uniforms.idColor.value.set(1 / 255, 0, 1);
  mesh.rotation.set(0.2, 0.3, 0.15);
  ringGroup.position.set(0.6, 0.2, 1.2);
  ghost.uniforms.ghost.value = 1;
  ghost.uniforms.color.value.set(0.1, 0.1, 0.1);
  ghostId.uniforms.idColor.value.set(2 / 255, 0, 0.5);
  stage.scene.add(group, ringGroup);

  const original = THREE.WebGLRenderTarget.prototype.dispose;
  let disposals = 0;
  const composite = Reflect.get(stage, 'composite') as THREE.ShaderMaterial;
  const optimized = composite.fragmentShader;

  try {
    const renderer = Reflect.get(stage, 'renderer') as THREE.WebGLRenderer;

    renderer.info.autoReset = false;
    renderer.info.reset();

    const before = await stage.draw(parts, camera, { width: 128, height: 128 });

    const drawCalls = renderer.info.render.calls;

    THREE.WebGLRenderTarget.prototype.dispose = function () {
      disposals++;
      original.call(this);
    };

    const counts = [32, 32].map((size) => stage.countNew(parts, camera, { width: size, height: size }));
    const after = await stage.draw(parts, camera, { width: 128, height: 128 });

    const visibilityDisposals = disposals;

    THREE.WebGLRenderTarget.prototype.dispose = original;

    const reference = await drawReference(parts, camera);

    for (const part of parts) stage.scene.add(part.group);

    toon.fragmentShader = 'void main() { missingGuideShader(); }';
    toon.needsUpdate = true;

    let compileRefused = false;

    try {
      await stage.draw(parts, camera, { width: 128, height: 128 });
    } catch {
      compileRefused = true;
    }

    return {
      counts,
      compileRefused,
      unchanged: before === after,
      shaderParity: reference.image === after,
      drawCalls,
      referenceCalls: reference.calls,
      usesOptimized: optimized.includes(GUIDE_NEIGHBORS),
      disposals: visibilityDisposals,
    };
  } finally {
    THREE.WebGLRenderTarget.prototype.dispose = original;
    stage.dispose();
    geometry.dispose();
    ringGeometry.dispose();
    ghost.dispose();
    ghostId.dispose();
    toon.dispose();
    id.dispose();
  }
}
