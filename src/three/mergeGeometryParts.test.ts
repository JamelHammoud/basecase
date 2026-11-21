import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { componentArrays } from './componentGeometry';
import { parseFigure } from './viewport/figureModels';
import { loadMesh } from '../utils/robotImport/meshes';
import * as merger from './mergeGeometryParts';

afterEach(() => vi.restoreAllMocks());

function sourceScene(count: number) {
  const scene = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const geometry = new THREE.BoxGeometry(20, 30, 40, 5, 5, 5);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cccccc' }));

    mesh.position.set(i * 30, -15, 7);
    mesh.rotation.set(0.2, -0.4, i * 0.3);
    scene.add(mesh);
  }

  return scene;
}

function arrays(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return null;

  return Object.fromEntries(
    Object.entries(geometry.attributes).map(([name, attribute]) => [name, [...attribute.array]]),
  );
}

it.each([1, 3])(
  'preserves import, component and figure output for %i pieces without singleton merge copies',
  async (count) => {
    const scene = sourceScene(count);
    const sources = scene.children.map((child) => arrays((child as THREE.Mesh).geometry));

    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene } as unknown as GLTF);

    const original = merger.mergeGeometryParts;
    const merge = vi.spyOn(merger, 'mergeGeometryParts');

    merge.mockImplementation((parts) => (parts.length ? mergeGeometries(parts, false) : null));

    const expectedMesh = arrays(await loadMesh(new ArrayBuffer(0), 'robot.glb'));
    const expectedComponent = await componentArrays(new ArrayBuffer(0));
    const expectedFigures = await Promise.all(
      ['human', 'dog'].map((kind) => parseFigure(new ArrayBuffer(0), kind as 'human' | 'dog').then(arrays)),
    );
    const avoidedBytes: number[] = [];

    merge.mockImplementation((parts) => {
      const result = original(parts);

      if (parts.length === 1) {
        expect(result).toBe(parts[0]);
        avoidedBytes.push(parts[0].getAttribute('position').array.byteLength);
      }

      return result;
    });

    expect(arrays(await loadMesh(new ArrayBuffer(0), 'robot.glb'))).toEqual(expectedMesh);
    expect(await componentArrays(new ArrayBuffer(0))).toEqual(expectedComponent);

    for (const [i, kind] of (['human', 'dog'] as const).entries()) {
      expect(arrays(await parseFigure(new ArrayBuffer(0), kind))).toEqual(expectedFigures[i]);
    }

    expect(avoidedBytes).toEqual(count === 1 ? [10800, 1440, 10800, 10800] : []);
    expect(scene.children.map((child) => arrays((child as THREE.Mesh).geometry))).toEqual(sources);
  },
);

it('preserves empty import and component outputs and figure refusal', async () => {
  vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene: sourceScene(0) } as unknown as GLTF);

  expect(await loadMesh(new ArrayBuffer(0), 'empty.glb')).toBeNull();
  expect(await componentArrays(new ArrayBuffer(0))).toEqual({ pieces: [], edges: new Float32Array(), size: [0, 0, 0] });
  await expect(parseFigure(new ArrayBuffer(0), 'human')).rejects.toThrow('The human figure has no meshes.');
});
