import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { worldGeometry } from './interference';

function previousPositions(group: THREE.Object3D) {
  const chunks: number[] = [];

  group.updateWorldMatrix(true, true);
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;

    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes.position) return;

    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();

    geometry.applyMatrix4(mesh.matrixWorld);
    chunks.push(...geometry.attributes.position.array);
    geometry.dispose();
  });

  return new Float32Array(chunks);
}

function scene(seed: number) {
  const parent = new THREE.Group();
  const group = new THREE.Group();

  parent.position.set(10, -20, 30);
  parent.rotation.set(seed / 31, -0.7, 0.2);
  group.scale.set(seed % 3 ? -1.2 : 0, 0.8, 2);
  parent.add(group);

  for (let i = 0; i < 3; i++) {
    const box = new THREE.BoxGeometry(10 + seed, 20, 30);
    const geometry = i % 2 ? box.toNonIndexed() : box;
    const mesh = new THREE.Mesh(geometry);

    if (geometry.index) geometry.computeTangents();

    mesh.visible = i !== 2;
    mesh.position.set(i * 7, -i, seed / 7);
    mesh.rotation.set(0.3, seed / 23, -0.2);
    group.add(mesh);
  }

  return group;
}

describe('build-guide world geometry', () => {
  it('preserves transformed triangles, source attributes and independent outputs', () => {
    for (let seed = 0; seed < 24; seed++) {
      const group = scene(seed);
      const mesh = group.children[0] as THREE.Mesh;
      const source = mesh.geometry.attributes.position.array.slice();
      const expected = previousPositions(group);
      const geometry = worldGeometry(group)!;

      expect(geometry.attributes.position.array).toEqual(expected);
      expect(Object.keys(geometry.attributes)).toEqual(['position']);
      expect(geometry.index).toBeNull();
      geometry.attributes.position.array.fill(0);
      group.position.x += 17;
      expect(worldGeometry(group)!.attributes.position.array).toEqual(previousPositions(group));
      expect(mesh.geometry.attributes.position.array).toEqual(source);
    }
  });

  it('returns no solid for an empty group', () => {
    expect(worldGeometry(new THREE.Group())).toBeNull();
  });

  it('omits full geometry conversion and unrelated attribute transforms', () => {
    const group = scene(7);
    const expected = previousPositions(group);
    const clone = vi.spyOn(THREE.BufferGeometry.prototype, 'clone');
    const expand = vi.spyOn(THREE.BufferGeometry.prototype, 'toNonIndexed');
    const transform = vi.spyOn(THREE.BufferGeometry.prototype, 'applyMatrix4');
    const geometry = worldGeometry(group)!;

    expect(geometry.attributes.position.array).toEqual(expected);
    expect(clone).not.toHaveBeenCalled();
    expect(expand).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
