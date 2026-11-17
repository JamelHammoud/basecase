import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type Faces = { centers: Float32Array; normals: Float32Array; areas: Float32Array; surfaceArea: number };

export class ShapeSolid {
  readonly box: THREE.Box3;
  readonly samples = new Map<number, Float32Array>();
  private tree: MeshBVH | null = null;
  private faceData: Faces | null = null;

  readonly positions: Float32Array;

  constructor(positions: Float32Array) {
    this.positions = positions;
    this.box = new THREE.Box3().setFromArray(positions);
  }

  get bvh(): MeshBVH {
    if (!this.tree) {
      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      this.tree = new MeshBVH(geometry);
      geometry.boundsTree = this.tree;
    }

    return this.tree;
  }

  get faces(): Faces {
    this.faceData ??= faceData(this.positions);

    return this.faceData;
  }

  get surfaceArea(): number {
    return this.faces.surfaceArea;
  }

  dispose(): void {
    this.tree?.geometry.dispose();
  }
}

const FACE_TARGET = 1500;
const MIN_FACE_AREA = 0.5;
const FACE_PIECE_MM2 = 25;
const MAX_FACE_SPLITS = 12;

function pieceWeights(n: number, cache: Map<number, number[]>): number[] {
  const cached = cache.get(n);

  if (cached) return cached;

  const weights: number[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const k = n - 1 - i - j;

      weights.push((i + 1 / 3) / n, (j + 1 / 3) / n, (k + 1 / 3) / n);

      if (k > 0) weights.push((i + 2 / 3) / n, (j + 2 / 3) / n, (k - 1 / 3) / n);
    }
  }

  cache.set(n, weights);

  return weights;
}

function pieceCenters({ a, b, c }: THREE.Triangle, weights: number[], out: number[], center: THREE.Vector3): void {
  for (let i = 0; i < weights.length; i += 3) {
    center
      .set(0, 0, 0)
      .addScaledVector(a, weights[i])
      .addScaledVector(b, weights[i + 1])
      .addScaledVector(c, weights[i + 2]);
    out.push(center.x, center.y, center.z);
  }
}

function faceData(positions: Float32Array): Faces {
  const count = positions.length / 3;
  const step = Math.max(1, Math.floor(count / 3 / FACE_TARGET));
  const centers: number[] = [];
  const normals: number[] = [];
  const areas: number[] = [];
  const weights = new Map<number, number[]>();
  let surfaceArea = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    edge = new THREE.Vector3(),
    center = new THREE.Vector3();
  const tri = new THREE.Triangle(a, b, c);

  for (let t = 0; t + 2 < count; t += 3 * step) {
    a.fromArray(positions, t * 3);
    b.fromArray(positions, t * 3 + 3);
    c.fromArray(positions, t * 3 + 6);

    n.subVectors(c, b).cross(edge.subVectors(a, b));

    const lengthSq = n.lengthSq();
    const length = Math.sqrt(lengthSq);
    const area = length * 0.5;

    if (area < MIN_FACE_AREA) continue;

    if (lengthSq > 0) n.multiplyScalar(1 / length);
    else n.set(0, 0, 0);

    const splits = Math.min(MAX_FACE_SPLITS, Math.ceil(Math.sqrt(area / FACE_PIECE_MM2)));
    const start = centers.length;
    const weight = Math.fround((area * step) / (splits * splits));

    pieceCenters(tri, pieceWeights(splits, weights), centers, center);

    for (let i = start; i < centers.length; i += 3) {
      normals.push(n.x, n.y, n.z);
      areas.push(weight);
      surfaceArea += weight;
    }
  }

  return {
    centers: new Float32Array(centers),
    normals: new Float32Array(normals),
    areas: new Float32Array(areas),
    surfaceArea,
  };
}

export const solidFromPositions = (positions: Float32Array) => new ShapeSolid(positions);

function steppedCount(limit: number, step: number): number {
  if (limit <= 0) return 0;

  return Math.max(1, Math.ceil(limit / step)) || 1;
}

export function samplesOf(solid: ShapeSolid, maxSamples: number): Float32Array {
  const cached = solid.samples.get(maxSamples);

  if (cached) return cached;

  const pos = solid.positions;
  const count = pos.length / 3;
  const step = Math.max(1, Math.floor(count / maxSamples));
  const vertices = steppedCount(count, step);
  const centroids =
    vertices < maxSamples * 1.5
      ? Math.min(steppedCount(count - 2, 3 * step), Math.ceil(maxSamples * 1.5) - vertices)
      : 0;
  const samples = new Float32Array((vertices + centroids) * 3);
  let at = 0;

  for (let i = 0; i < count; i += step) {
    samples[at++] = pos[i * 3];
    samples[at++] = pos[i * 3 + 1];
    samples[at++] = pos[i * 3 + 2];
  }

  for (let t = 0; t + 2 < count && at < samples.length; t += 3 * step) {
    for (let k = 0; k < 3; k++) samples[at++] = (pos[t * 3 + k] + pos[t * 3 + 3 + k] + pos[t * 3 + 6 + k]) / 3;
  }

  solid.samples.set(maxSamples, samples);

  return samples;
}

export function mergeMeshes(meshes: Array<{ positions: Float32Array; index: Uint32Array | null; matrix: number[] }>) {
  const total = meshes.reduce((n, m) => n + (m.index ? m.index.length : m.positions.length / 3) * 3, 0);
  const out = new Float32Array(total);
  const v = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let o = 0;

  for (const m of meshes) {
    matrix.fromArray(m.matrix);

    const count = m.index ? m.index.length : m.positions.length / 3;

    for (let i = 0; i < count; i++) {
      v.fromArray(m.positions, (m.index ? m.index[i] : i) * 3).applyMatrix4(matrix);
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = v.z;
    }
  }

  return out;
}
