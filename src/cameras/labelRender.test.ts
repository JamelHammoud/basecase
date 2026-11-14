import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { LabelRenderer } from './labelRender';
import type { LensRenderer, LensShot } from './lensRender';

it('reuses current label materials and disposes materials from previous sampled surfaces', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
  const renderer = {
    getRenderTarget: () => null,
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    readRenderTargetPixels: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const materials: THREE.Material[] = [];
  const lens = { render: () => materials.push(mesh.material) } as unknown as LensRenderer;
  const shot: LensShot = {
    position: [0, 0, 10],
    target: [0, 0, 0],
    up: [0, 1, 0],
    lens: { model: 'pinhole', hfovDeg: 60 },
  };
  const labels = new LabelRenderer(renderer, 1, 1);

  scene.add(mesh);
  labels.draw(scene, lens, shot, []);

  const first = materials[0];
  const disposed = vi.fn();

  first.addEventListener('dispose', disposed);
  labels.draw(scene, lens, shot, []);
  expect(materials[2]).toBe(first);
  expect(disposed).not.toHaveBeenCalled();
  mesh.material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  labels.draw(scene, lens, shot, []);
  expect(disposed).toHaveBeenCalledOnce();
  expect(materials[4]).not.toBe(first);

  const lastDisposed = vi.fn();

  materials[4].addEventListener('dispose', lastDisposed);
  labels.dispose();
  expect(lastDisposed).toHaveBeenCalledOnce();
  expect(disposed).toHaveBeenCalledOnce();
});
