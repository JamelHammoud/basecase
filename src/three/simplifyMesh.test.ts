import { expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { simplifyMesh } from './geometryOps';

async function previous(soup: Float32Array, target: number) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));

  const welded = mergeVertices(geometry, 1e-3);
  const positions = (welded.getAttribute('position').array as Float32Array).slice();
  const indices = new Uint32Array(welded.index!.array);

  await MeshoptSimplifier.ready;

  if (indices.length / 3 <= target || !MeshoptSimplifier.supported) return { positions, indices };

  const [out] = MeshoptSimplifier.simplify(indices, positions, 3, Math.max(target * 3, 36), 0.002, ['Prune']);

  return { positions, indices: out.length >= 36 ? out : indices };
}

it('preserves welded coordinates and simplified indices across link targets', async () => {
  const geometry = new THREE.IcosahedronGeometry(40, 3);
  const soup = geometry.getAttribute('position').array as Float32Array;
  const saved = soup.slice();

  for (const target of [12, 100, Infinity]) {
    const expected = await previous(soup, target);
    const actual = await simplifyMesh(soup, target);

    expect(actual).toEqual(expected);
    expect(soup).toEqual(saved);
  }
});

it('owns independent transferable output for repeated calls and source subarrays', async () => {
  const source = new THREE.BoxGeometry(20, 30, 40).toNonIndexed().getAttribute('position').array as Float32Array;
  const storage = new Float32Array(source.length + 6);

  storage.set(source, 3);

  const soup = storage.subarray(3, storage.length - 3);
  const saved = storage.slice();
  const first = await simplifyMesh(soup, Infinity);
  const second = await simplifyMesh(soup, Infinity);
  const transferred = structuredClone(first, { transfer: [first.positions.buffer, first.indices.buffer] });

  expect(first.positions.byteLength).toBe(0);
  expect(transferred).toEqual(second);
  expect(transferred.positions.byteOffset).toBe(0);
  expect(transferred.positions.byteLength).toBe(transferred.positions.buffer.byteLength);
  transferred.positions.fill(99);
  transferred.indices.fill(0);
  expect(second).toEqual(await previous(soup, Infinity));
  expect(storage).toEqual(saved);
});
