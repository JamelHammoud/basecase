import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { tessellateGeometryForSculpting, weldAndNormalizeGeometry } from '../sculptEngine';
import { convertPartToSculptMesh } from './sculptConversion';

const part: ScenePart = {
  id: 'sculpt-source',
  name: 'Source',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 30, depth: 40 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
};

function previous(group: THREE.Group) {
  const coordinates: number[] = [];

  group.updateMatrixWorld(true);
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const source = child.geometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();

    geometry.applyMatrix4(child.matrixWorld);

    const position = tessellateGeometryForSculpting(geometry, 2).getAttribute('position');

    for (let i = 0; i < position.count * 3; i++) coordinates.push(position.array[i]);
  });

  return weldAndNormalizeGeometry(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3)),
  );
}

function transformedGroup(geometry: THREE.BufferGeometry) {
  const group = new THREE.Group();
  const nested = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

  nested.position.set(3, -7, 2);
  nested.rotation.set(0.2, -0.4, 0.6);
  mesh.scale.set(-2, 0.7, 1.3);
  mesh.rotation.set(0.5, 0.3, -0.1);
  nested.add(mesh);
  group.add(nested);

  return group;
}

describe('part-to-Sculpt coordinate preparation', () => {
  it('preserves complete output and source attributes across transformed indexed and expanded meshes', () => {
    const interleaved = new THREE.InterleavedBuffer(
      Float32Array.from({ length: 45 }, (_, i) => i * 0.17),
      5,
    );
    const geometries = [
      new THREE.BoxGeometry(20, 30, 40),
      new THREE.CylinderGeometry(4, 8, 20, 8, 2).toNonIndexed(),
      new THREE.BufferGeometry().setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 1)),
      new THREE.BufferGeometry()
        .setAttribute('position', new THREE.Int16BufferAttribute([1, 2, 3, 4, 5, 6, 7, 8, 9], 3, true))
        .setIndex([2, 0, 1]),
      new THREE.SphereGeometry(10, 100, 90),
    ];

    for (const geometry of geometries) {
      const original = geometry.clone();
      const group = transformedGroup(geometry);
      const expected = previous(group);

      expect(convertPartToSculptMesh(part, () => group)).toEqual(expected);

      for (const name of Object.keys(original.attributes)) {
        expect(geometry.getAttribute(name).array).toEqual(original.getAttribute(name).array);
      }

      expect(geometry.index).toEqual(original.index);
    }
  });

  it('does not copy or transform discarded source attributes', () => {
    for (const indexed of [true, false]) {
      const box = new THREE.BoxGeometry(20, 30, 40, 10, 10, 10);
      const geometry = indexed ? box : box.toNonIndexed();
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      const normalTransform = vi.spyOn(THREE.BufferAttribute.prototype, 'applyNormalMatrix');
      const normalRead = vi.spyOn(normal, 'getX');
      const normalClone = vi.spyOn(normal, 'clone');
      const uvClone = vi.spyOn(uv, 'clone');

      convertPartToSculptMesh(part, () => transformedGroup(geometry));
      expect(normalTransform).not.toHaveBeenCalled();
      expect(normalRead).not.toHaveBeenCalled();
      expect(normalClone).not.toHaveBeenCalled();
      expect(uvClone).not.toHaveBeenCalled();
      normalTransform.mockRestore();
    }
  });
});
