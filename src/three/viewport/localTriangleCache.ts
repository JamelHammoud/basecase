import * as THREE from 'three';
import { localTriangles } from '../meshMeasure';
import { geometryWorker } from '../geometryWorker';
import type { SnapshotAttribute, SnapshotGeometry } from '../triangleSnapshots';
import { outputLine } from '../analysis/rotorSplit';

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

interface MeshStamp {
  object: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  position: Attribute;
  positionVersion: number;
  index: THREE.BufferAttribute | null;
  indexVersion: number;
  matrix: number[];
}

interface Entry {
  meshes: MeshStamp[];
  root: number[];
  triangles: Float32Array;
  output?: [number, number, number] | null;
}

const entries = new WeakMap<THREE.Object3D, Entry>();
const version = (attribute: Attribute) =>
  'isInterleavedBufferAttribute' in attribute
    ? (attribute as THREE.InterleavedBufferAttribute).data.version
    : (attribute as THREE.BufferAttribute).version;

function meshesOf(object: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.isMesh && mesh.visible && mesh.geometry?.attributes.position) meshes.push(mesh);
  });

  return meshes;
}

function sameMesh(mesh: THREE.Mesh, stamp: MeshStamp | undefined) {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;

  return (
    stamp &&
    stamp.object === mesh &&
    stamp.geometry === mesh.geometry &&
    stamp.position === position &&
    stamp.positionVersion === version(position) &&
    stamp.index === index &&
    stamp.indexVersion === (index?.version ?? 0) &&
    stamp.matrix.every((value, axis) => value === mesh.matrixWorld.elements[axis])
  );
}

function meshStamp(mesh: THREE.Mesh): MeshStamp {
  const position = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;

  return {
    object: mesh,
    geometry: mesh.geometry,
    position,
    positionVersion: version(position),
    index,
    indexVersion: index?.version ?? 0,
    matrix: mesh.matrixWorld.toArray(),
  };
}

function currentEntry(object: THREE.Object3D, meshes: THREE.Mesh[], entry?: Entry) {
  return (
    entry &&
    entry.meshes.length === meshes.length &&
    entry.root.every((value, axis) => value === object.matrixWorld.elements[axis]) &&
    meshes.every((mesh, index) => sameMesh(mesh, entry.meshes[index]))
  );
}

function snapshotAttribute(attribute: Attribute): SnapshotAttribute {
  const common = { itemSize: attribute.itemSize, normalized: attribute.normalized };

  if ('isInterleavedBufferAttribute' in attribute) {
    const source = attribute as THREE.InterleavedBufferAttribute;

    return { ...common, array: source.data.array.slice(), stride: source.data.stride, offset: source.offset };
  }

  return { ...common, array: (attribute as THREE.BufferAttribute).array.slice() };
}

export async function prepareLocalTriangles(objects: THREE.Object3D[], current: () => boolean): Promise<void> {
  const geometries: SnapshotGeometry[] = [];
  const ids = new Map<THREE.BufferGeometry, number>();
  const sources = objects.flatMap((object) => {
    object.updateWorldMatrix(true, true);

    const meshes = meshesOf(object);

    if (currentEntry(object, meshes, entries.get(object))) return [];

    const entry: Entry = {
      meshes: meshes.map(meshStamp),
      root: object.matrixWorld.toArray(),
      triangles: new Float32Array(),
      output: null,
    };
    const snapshot = {
      root: entry.root,
      meshes: meshes.map((mesh) => {
        let geometry = ids.get(mesh.geometry);

        if (geometry === undefined) {
          geometry = geometries.length;
          ids.set(mesh.geometry, geometry);
          geometries.push({
            position: snapshotAttribute(mesh.geometry.attributes.position),
            index: mesh.geometry.index && snapshotAttribute(mesh.geometry.index),
          });
        }

        return { geometry, matrix: mesh.matrixWorld.toArray() };
      }),
    };

    return [{ object, entry, snapshot }];
  });

  if (!sources.length) return;

  const result = await geometryWorker.call(
    'triangleSnapshots',
    { geometries, sources: sources.map(({ snapshot }) => snapshot) },
    geometries.flatMap(({ position, index }) => [position.array.buffer, ...(index ? [index.array.buffer] : [])]),
  );

  if (!current()) throw AbortSignal.abort().reason;

  for (const [index, { object, entry }] of sources.entries()) {
    object.updateWorldMatrix(true, true);

    if (!currentEntry(object, meshesOf(object), entry)) throw AbortSignal.abort().reason;

    entries.set(object, { ...entry, ...result[index] });
  }
}

function currentTriangles(object: THREE.Object3D): Entry {
  object.updateWorldMatrix(true, true);

  const meshes = meshesOf(object);
  const entry = entries.get(object);
  const same = currentEntry(object, meshes, entry);

  if (same && entry) return entry;

  const triangles = localTriangles(object);
  const next: Entry = {
    meshes: meshes.map(meshStamp),
    root: object.matrixWorld.toArray(),
    triangles,
  };

  entries.set(object, next);

  return next;
}

export const cachedLocalTriangles = (object: THREE.Object3D): Float32Array =>
  currentTriangles(object).triangles.slice();

export function cachedLocalOutputPoint(object: THREE.Object3D): THREE.Vector3 | null {
  const entry = currentTriangles(object);

  entry.output ??= entry.triangles.length ? outputLine(entry.triangles).start.toArray() : null;

  const point = entry.output;

  return point ? new THREE.Vector3(...point) : null;
}
