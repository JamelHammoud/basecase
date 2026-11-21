import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { localTriangles } from '../meshMeasure';
import { cachedLocalTriangles } from './localTriangleCache';

it('reuses unchanged geometry and placements without sharing mutable or transferable output', () => {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(20, 10, 30), new MeshBasicMaterial());

  root.add(mesh);
  root.position.set(15, 20, 35);
  mesh.rotation.set(0.2, 0.4, 0.1);

  const expected = localTriangles(root);
  const reads = vi.spyOn(mesh.geometry.attributes.position, 'getX');
  const first = cachedLocalTriangles(root);

  expect(first).toEqual(expected);
  expect(reads).toHaveBeenCalled();
  reads.mockClear();
  first.fill(0);
  expect(cachedLocalTriangles(root)).toEqual(expected);
  expect(reads).not.toHaveBeenCalled();
  root.position.x += 50;
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  mesh.position.z += 12;
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  mesh.geometry.attributes.position.setX(0, 40);
  mesh.geometry.attributes.position.needsUpdate = true;
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  mesh.visible = false;
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  mesh.visible = true;
  mesh.geometry = new BoxGeometry(10, 10, 10);
  expect(cachedLocalTriangles(root)).toEqual(localTriangles(root));
  root.remove(mesh);
  expect(cachedLocalTriangles(root)).toEqual(new Float32Array());
  vi.restoreAllMocks();
});
