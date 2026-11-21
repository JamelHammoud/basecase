import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { componentArrays } from './componentGeometry';
import { parseFigure } from './viewport/figureModels';
import { loadMesh } from '../utils/robotImport/meshes';

afterEach(() => vi.restoreAllMocks());

function sourceScene(indexed: boolean, wide: boolean) {
  const scene = new THREE.Group();
  const parent = new THREE.Group();

  parent.rotation.set(0.3, -0.2, 0.7);
  parent.position.set(4, -8, 12);
  scene.add(parent);

  for (let i = 0; i < 3; i++) {
    const box = new THREE.BoxGeometry(20, 30, 40, 3, 3, 3);
    const geometry = indexed ? box : box.toNonIndexed();

    if (indexed && wide) geometry.setIndex(new THREE.Uint32BufferAttribute(geometry.index!.array, 1));

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cccccc' }));

    mesh.position.set(i * 30, -15, 7);
    mesh.rotation.set(0.2, -0.4, i * 0.3);
    mesh.scale.set(i === 1 ? -2 : 1, 0.5, 1.3);
    parent.add(mesh);
  }

  return { scene, geometries: parent.children.map((child) => (child as THREE.Mesh).geometry) };
}

const attributes = (geometry: THREE.BufferGeometry | null) =>
  geometry && Object.fromEntries(Object.entries(geometry.attributes).map(([name, attr]) => [name, [...attr.array]]));

async function preparedOutputs() {
  return {
    mesh: attributes(await loadMesh(new ArrayBuffer(0), 'robot.glb')),
    component: await componentArrays(new ArrayBuffer(0)),
    human: attributes(await parseFigure(new ArrayBuffer(0), 'human')),
    dog: attributes(await parseFigure(new ArrayBuffer(0), 'dog')),
  };
}

it.each([
  { indexed: true, wide: false },
  { indexed: true, wide: true },
  { indexed: false, wide: false },
])('preserves complete preparation with borrowed indices: %o', async ({ indexed, wide }) => {
  const { scene, geometries } = sourceScene(indexed, wide);
  const sources = geometries.map(attributes);
  const indices = geometries.map((geometry) => geometry.index && [...geometry.index.array]);
  const original = THREE.BufferGeometry.prototype.applyMatrix4;
  const apply = vi.spyOn(THREE.BufferGeometry.prototype, 'applyMatrix4');

  vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene } as unknown as GLTF);
  apply.mockImplementation(function (this: THREE.BufferGeometry, matrix) {
    if (this.index) this.setIndex(this.index.clone());

    return original.call(this, matrix);
  });

  const clones = geometries.flatMap((geometry) => (geometry.index ? [vi.spyOn(geometry.index, 'clone')] : []));
  const expected = await preparedOutputs();

  expect(clones.map((clone) => clone.mock.calls.length)).toEqual(indexed ? [4, 4, 4] : []);
  clones.forEach((clone) => clone.mockClear());
  apply.mockImplementation(original);

  expect(await preparedOutputs()).toEqual(expected);
  expect(await preparedOutputs()).toEqual(expected);
  expect(clones.map((clone) => clone.mock.calls.length)).toEqual(indexed ? [0, 0, 0] : []);
  expect(geometries.map(attributes)).toEqual(sources);
  expect(geometries.map((geometry) => geometry.index && [...geometry.index.array])).toEqual(indices);

  scene.position.x += 17;

  const edited = await preparedOutputs();

  expect(edited.mesh).not.toEqual(expected.mesh);
  expect(geometries.map(attributes)).toEqual(sources);
  expect(geometries.map((geometry) => geometry.index && [...geometry.index.array])).toEqual(indices);
});
