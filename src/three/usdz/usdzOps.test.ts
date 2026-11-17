import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { usdzOf, type UsdzGeometry, type UsdzJob } from './usdzOps';

afterEach(() => vi.restoreAllMocks());

it('exports shared indexed and nonindexed geometry with independent reflected winding and unchanged sources', async () => {
  const positions = new Float32Array([0, 0, 0, 1000, 0, 0, 0, 1000, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const index = new Uint32Array([0, 1, 2]);
  const geometries: UsdzGeometry[] = [
    { id: 'indexed', positions, normals, index },
    { id: 'soup', positions, normals: null, index: null },
  ];
  const material = { color: '#cccccc', roughness: 0.5, metalness: 0, opacity: 1 };
  const meshes = geometries.flatMap((geometry) =>
    [1, -1, 1, -1].map((x) => ({
      geometry: geometry.id,
      matrix: new THREE.Matrix4().makeScale(x, 2, 3).toArray(),
      material,
    })),
  );
  const job: UsdzJob = { geometries, meshes };
  const before = structuredClone(job);
  const parse = USDZExporter.prototype.parseAsync;
  const built: THREE.BufferGeometry[] = [];

  vi.spyOn(USDZExporter.prototype, 'parseAsync').mockImplementation(function (this: USDZExporter, scene, options) {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) built.push(object.geometry);
    });

    return parse.call(this, scene, options);
  });

  const bytes = await usdzOf(job);
  const files = unzipSync(bytes);
  const geometryFiles = Object.entries(files).filter(([name]) => name.startsWith('geometries/'));

  expect(geometryFiles).toHaveLength(8);
  expect(built).toHaveLength(8);
  expect(built[0].index!.array).toBe(index);
  expect(built[2].index!.array).toBe(index);
  expect(built[4].index).toBeNull();
  expect(built[6].index).toBeNull();

  for (let i = 0; i < built.length; i++) {
    const reflected = i % 2 === 1;
    const geometry = built[i];
    const text = strFromU8(geometryFiles[i][1]);

    expect(text).toContain(`int[] faceVertexIndices = [${reflected ? '0, 2, 1' : '0, 1, 2'}]`);
    expect(geometry.getAttribute('position').array).not.toBe(positions);
    expect(Array.from(geometry.getAttribute('normal').array)).toEqual(Array.from(normals));
    expect(geometry.boundingBox!.min.y).toBe(0);
    expect(geometry.boundingBox!.max.y).toBe(2);

    if (reflected) {
      expect(geometry.index!.array).not.toBe(index);
      expect(Array.from(geometry.index!.array)).toEqual([0, 2, 1]);
    }
  }

  expect(job).toEqual(before);
  expect(built[1].index!.array).not.toBe(built[3].index!.array);
  expect(built[5].index!.array).not.toBe(built[7].index!.array);
});
