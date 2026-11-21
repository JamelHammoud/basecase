import * as THREE from 'three';
import { appearanceRenderChecks } from './renderChecks';
import { textureBatchRenderChecks } from './textureBatchRenderChecks';

export async function appearanceCheckWorkloads(mode: 'render' | 'batching') {
  if (mode === 'render') return appearanceRenderChecks();

  const renderer = new THREE.WebGLRenderer({ canvas: new OffscreenCanvas(64, 64), antialias: false });

  renderer.setSize(64, 64, false);
  renderer.toneMapping = THREE.NoToneMapping;

  try {
    return await textureBatchRenderChecks(renderer);
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
