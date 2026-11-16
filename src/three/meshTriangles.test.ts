import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { localTriangles, rigidFrame, worldTriangles } from './meshMeasure';

function bufferedTriangles(object: THREE.Object3D) {
  const chunks: Float32Array[] = [];
  const point = new THREE.Vector3();

  object.updateWorldMatrix(true, true);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.attributes.position;

    if (!mesh.isMesh || !mesh.visible || !position) return;

    const index = mesh.geometry.index;
    const count = index?.count ?? position.count;
    const chunk = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      point
        .fromBufferAttribute(position, index ? index.getX(i) : i)
        .applyMatrix4(mesh.matrixWorld)
        .toArray(chunk, i * 3);
    }

    chunks.push(chunk);
  });

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total - (total % 9));
  let offset = 0;

  for (const chunk of chunks) {
    const count = Math.min(chunk.length - (chunk.length % 9), out.length - offset);

    out.set(chunk.subarray(0, count), offset);
    offset += count;
  }

  return out;
}

function meshOf(seed: number) {
  const geometry = new THREE.BufferGeometry();
  const vertices = 3 + (seed % 11);
  const data = Float32Array.from({ length: vertices * 6 }, (_, i) => Math.sin(seed + i) * 23);

  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, 6), 3, 1));

  if (seed % 2) geometry.setIndex(Array.from({ length: 3 + (seed % 13) }, (_, i) => (i * 7) % vertices));

  const mesh = new THREE.Mesh(geometry);

  mesh.position.set(seed / 7, -seed / 3, seed / 11);
  mesh.rotation.set(seed / 31, seed / 23, seed / 17);
  mesh.scale.set(seed % 3 ? -1.3 : 0, 0.7, 2.1);

  return mesh;
}

describe('object triangle extraction', () => {
  it('matches buffered extraction across nested, indexed, interleaved and incomplete meshes', () => {
    for (let seed = 0; seed < 80; seed++) {
      const parent = new THREE.Group();
      const group = new THREE.Group();
      const hidden = meshOf(seed + 3);
      const first = meshOf(seed);
      const second = meshOf(seed + 1);
      const source = first.geometry.attributes.position.array.slice();

      parent.position.set(10, -20, 30);
      parent.rotation.set(0.3, -0.7, 0.2);
      group.scale.set(1.2, 0.8, -2);
      hidden.visible = false;
      hidden.add(second);
      group.add(first, hidden, new THREE.Mesh(new THREE.BufferGeometry()));
      parent.add(group);

      const expected = bufferedTriangles(group);
      const actual = worldTriangles(group);

      expect(actual).toEqual(expected);

      const inverse = rigidFrame(group).matrix.invert();
      const point = new THREE.Vector3();

      for (let i = 0; i < expected.length; i += 3) {
        point.fromArray(expected, i).applyMatrix4(inverse).toArray(expected, i);
      }

      expect(localTriangles(group)).toEqual(expected);
      expect(first.geometry.attributes.position.array).toEqual(source);
      first.position.x += 17;
      expect(worldTriangles(group)).toEqual(bufferedTriangles(group));
      expect(actual).not.toEqual(worldTriangles(group));
    }
  });

  it('keeps empty outputs and independent result storage', () => {
    expect(worldTriangles(new THREE.Group())).toEqual(new Float32Array());

    const mesh = meshOf(2);
    const original = worldTriangles(mesh);
    const changed = worldTriangles(mesh);

    changed.fill(99);
    expect(worldTriangles(mesh)).toEqual(original);
  });

  it.each([300, 600])('writes %i triangles without copying transformed chunks', (triangles) => {
    const group = new THREE.Group();

    for (let i = 0; i < 3; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = Float32Array.from({ length: triangles * 3 }, (_, k) => Math.sin(k + i));
      const mesh = new THREE.Mesh(geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)));

      mesh.position.set(i, i * 2, -i);
      group.add(mesh);
    }

    const expected = bufferedTriangles(group);
    const copy = vi.spyOn(Float32Array.prototype, 'set');
    const actual = worldTriangles(group);
    const copies = copy.mock.calls.length;

    copy.mockRestore();
    expect(actual).toEqual(expected);
    expect(copies).toBe(0);
    expect(actual).toHaveLength(triangles * 9);
  });
});
