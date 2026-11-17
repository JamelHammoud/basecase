import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { usdzOf, type UsdzGeometry, type UsdzJob } from './usdzOps';

afterEach(() => vi.restoreAllMocks());

function transformJob(count: number): UsdzJob {
  const source = new THREE.BoxGeometry(170, 230, 310);
  const geometries: UsdzGeometry[] = [
    {
      id: 'box',
      positions: new Float32Array(source.getAttribute('position').array),
      normals: new Float32Array(source.getAttribute('normal').array),
      index: new Uint32Array(source.index!.array),
    },
  ];
  const meshes = Array.from({ length: count }, (_, i) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(i * 17, -i * 13, i * 7),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.13, i * 0.29, -i * 0.19)),
      new THREE.Vector3(i % 2 ? -2 : 1, i % 5 ? 3 : 0, 0.5),
    );

    matrix.elements[4] += i * 0.003;

    return {
      geometry: 'box',
      matrix: matrix.toArray(),
      material: { color: '#cccccc', roughness: 0.5, metalness: 0, opacity: 1 },
    };
  });

  source.dispose();

  return { geometries, meshes };
}

function precedingPlacements(job: UsdzJob) {
  const source = job.geometries[0];
  const units = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);

  return job.meshes.map(({ matrix }) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(source.positions.slice(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals!.slice(), 3));
    geometry.applyMatrix4(units.clone().multiply(new THREE.Matrix4().fromArray(matrix)));

    return geometry;
  });
}

it.each([1, 300, 600])('retains one export transform across %i independently baked placements', async (count) => {
  const job = transformJob(count);
  const before = structuredClone(job);
  const expected = precedingPlacements(job);
  const transforms: THREE.Matrix4[] = [];
  const apply = THREE.BufferGeometry.prototype.applyMatrix4;
  let floorOffset: THREE.Matrix4 | undefined;

  vi.spyOn(THREE.BufferGeometry.prototype, 'applyMatrix4').mockImplementation(function (
    this: THREE.BufferGeometry,
    matrix,
  ) {
    if (transforms.length < count) transforms.push(matrix);
    else floorOffset ??= matrix.clone();

    return apply.call(this, matrix);
  });
  vi.spyOn(USDZExporter.prototype, 'parseAsync').mockImplementation(async (scene) => {
    const box = new THREE.Box3();

    for (const geometry of expected) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }

    const center = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);

    expect(floorOffset!.elements).toEqual(offset.elements);

    for (const [i, mesh] of scene.children.entries()) {
      const geometry = (mesh as THREE.Mesh).geometry;

      apply.call(expected[i], offset);
      expect(geometry.getAttribute('position').array).toEqual(expected[i].getAttribute('position').array);
      expect(geometry.getAttribute('normal').array).toEqual(expected[i].getAttribute('normal').array);
      expect(geometry.getAttribute('position').array).not.toBe(job.geometries[0].positions);
    }

    return new Uint8Array();
  });

  await usdzOf(job);

  expect(transforms).toHaveLength(count);
  expect(new Set(transforms).size).toBe(1);
  expect(job).toEqual(before);

  for (const geometry of expected) geometry.dispose();
});

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
