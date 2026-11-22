import * as THREE from 'three';
import { localTriangles } from './meshMeasure';
import { outputLine } from './analysis/rotorSplit';
import { numbersHash } from '../utils/geometryHash';

export interface SnapshotAttribute {
  array: THREE.TypedArray;
  itemSize: number;
  normalized: boolean;
  stride?: number;
  offset?: number;
}

export interface SnapshotGeometry {
  position: SnapshotAttribute;
  index: SnapshotAttribute | null;
}

export interface TriangleSnapshot {
  root: number[];
  meshes: Array<{ geometry: number; matrix: number[] }>;
}

export interface TriangleSnapshots {
  geometries: SnapshotGeometry[];
  sources: TriangleSnapshot[];
}

export interface TriangleReading {
  triangles: Float32Array;
  output: [number, number, number] | null;
}

function attributeOf(attribute: SnapshotAttribute) {
  const { array, itemSize, normalized, stride, offset } = attribute;

  if (stride !== undefined)
    return new THREE.InterleavedBufferAttribute(
      new THREE.InterleavedBuffer(array, stride),
      itemSize,
      offset!,
      normalized,
    );

  return new THREE.BufferAttribute(array, itemSize, normalized);
}

export function triangleSnapshots(input: TriangleSnapshots): TriangleReading[] {
  const readings = new Map<string, TriangleReading[]>();
  const geometries = input.geometries.map(({ position, index }) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', attributeOf(position));

    if (index) geometry.setIndex(new THREE.BufferAttribute(index.array, index.itemSize, index.normalized));

    return geometry;
  });

  return input.sources.map((source) => {
    const root = new THREE.Group();

    root.matrixWorldAutoUpdate = false;
    root.matrixWorld.fromArray(source.root);

    for (const part of source.meshes) {
      const mesh = new THREE.Mesh(geometries[part.geometry]);

      mesh.matrixWorldAutoUpdate = false;
      mesh.matrixWorld.fromArray(part.matrix);
      root.add(mesh);
    }

    return sharedReading(localTriangles(root), readings);
  });
}

function sharedReading(triangles: Float32Array, readings: Map<string, TriangleReading[]>): TriangleReading {
  const key = numbersHash(triangles);
  const bucket = readings.get(key) ?? [];
  const bits = new Uint32Array(triangles.buffer, triangles.byteOffset, triangles.length);
  const known = bucket.find((reading) => {
    const values = reading.triangles;

    return (
      values.length === triangles.length &&
      new Uint32Array(values.buffer, values.byteOffset, values.length).every((value, index) => value === bits[index])
    );
  });

  if (known) return known;

  const reading: TriangleReading = {
    triangles,
    output: triangles.length ? outputLine(triangles).start.toArray() : null,
  };

  bucket.push(reading);
  readings.set(key, bucket);

  return reading;
}
