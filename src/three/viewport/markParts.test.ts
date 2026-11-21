import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { partsUnder } from './markParts';
import type { ViewportContext } from './viewportContext';

function fixture() {
  const camera = new THREE.PerspectiveCamera();
  const partsRoot = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const add = (id: string, x: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(x, 0, z);
    mesh.userData.partId = id;
    partsRoot.add(mesh);

    return mesh;
  };
  const far = add('far', 0, -10);
  const near = add('near', 0, -5);
  const side = add('side', 5, -5);
  const ctx = { stage: { camera, partsRoot } } as unknown as ViewportContext;

  partsRoot.updateMatrixWorld(true);

  return { ctx, camera, near, side, far, geometry, material };
}

function release(scene: ReturnType<typeof fixture>) {
  scene.geometry.dispose();
  scene.material.dispose();
}

describe('annotation part probes', () => {
  it('keeps nearest hits in first-seen order and clears hits before misses', () => {
    const scene = fixture();
    const points = [
      new THREE.Vector3(5, 0, -5),
      new THREE.Vector3(0, 0, -5),
      new THREE.Vector3(-10, 0, -5),
      new THREE.Vector3(5, 0, -5),
    ];
    const saved = points.map((p) => p.toArray());
    const raycaster = new THREE.Raycaster();

    expect(partsUnder(scene.ctx, raycaster, points)).toEqual(['side', 'near']);
    expect(points.map((p) => p.toArray())).toEqual(saved);
    expect(scene.camera.position.toArray()).toEqual([0, 0, 0]);
    scene.near.position.x = -5;
    scene.ctx.stage.partsRoot.updateMatrixWorld(true);
    expect(partsUnder(scene.ctx, raycaster, [points[1]])).toEqual(['far']);
    expect(partsUnder(scene.ctx, raycaster, [])).toEqual([]);
    release(scene);
  });

  it.each([48, 49, 96, 97, 600])('retains sampling and one workspace for %i points', (count) => {
    const scene = fixture();
    const points = Array.from({ length: count }, (_, i) => new THREE.Vector3(i % 2 === 0 ? 0 : 5, 0, -5));
    const raycaster = new THREE.Raycaster();
    const set = vi.spyOn(raycaster, 'set');
    const intersect = vi.spyOn(raycaster, 'intersectObjects');
    const step = Math.max(1, Math.ceil(count / 48));
    const samples = Math.ceil(count / step);
    const expected = step % 2 === 0 ? ['near'] : ['near', 'side'];

    expect(partsUnder(scene.ctx, raycaster, points)).toEqual(expected);
    expect(set).toHaveBeenCalledTimes(samples);
    expect(new Set(set.mock.calls.map((call) => call[1])).size).toBe(1);
    expect(intersect).toHaveBeenCalledTimes(samples);
    expect(intersect.mock.calls.every((call) => call[2] !== undefined)).toBe(true);
    expect(new Set(intersect.mock.calls.map((call) => call[2])).size).toBe(1);
    release(scene);
  });
});
