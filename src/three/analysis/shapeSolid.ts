import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type Faces = { centers: Float32Array; normals: Float32Array; areas: Float32Array };

export class ShapeSolid {
  readonly box: THREE.Box3;
  readonly samples = new Map<number, Float32Array>();
  private tree: MeshBVH | null = null;
  private faceData: Faces | null = null;
  private sampledArea: number | null = null;

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
    this.sampledArea ??= this.faces.areas.reduce((s, x) => s + x, 0);

    return this.sampledArea;
  }

  dispose(): void {
    this.tree?.geometry.dispose();
  }
}

const FACE_TARGET = 1500;
const MIN_FACE_AREA = 0.5;
const FACE_PIECE_MM2 = 25;
const MAX_FACE_SPLITS = 12;

function pieceCenters({ a, b, c }: THREE.Triangle, n: number, out: number[], center: THREE.Vector3): void {
  const at = (u: number, v: number, w: number) => {
    center
      .set(0, 0, 0)
      .addScaledVector(a, u / n)
      .addScaledVector(b, v / n)
      .addScaledVector(c, w / n);
    out.push(center.x, center.y, center.z);
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const k = n - 1 - i - j;

      at(i + 1 / 3, j + 1 / 3, k + 1 / 3);

      if (k > 0) at(i + 2 / 3, j + 2 / 3, k - 1 / 3);
    }
  }
}

function faceData(positions: Float32Array): Faces {
  const count = positions.length / 3;
  const step = Math.max(1, Math.floor(count / 3 / FACE_TARGET));
  const centers: number[] = [];
  const normals: number[] = [];
  const areas: number[] = [];
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
    const weight = (area * step) / (splits * splits);

    pieceCenters(tri, splits, centers, center);

    for (let i = start; i < centers.length; i += 3) {
      normals.push(n.x, n.y, n.z);
      areas.push(weight);
    }
  }

  return { centers: new Float32Array(centers), normals: new Float32Array(normals), areas: new Float32Array(areas) };
}

export const solidFromPositions = (positions: Float32Array) => new ShapeSolid(positions);

export function samplesOf(solid: ShapeSolid, maxSamples: number): Float32Array {
  const cached = solid.samples.get(maxSamples);

  if (cached) return cached;

  const pos = solid.positions;
  const count = pos.length / 3;
  const step = Math.max(1, Math.floor(count / maxSamples));
  let sampleCount = 0;

  for (let i = 0; i < count; i += step) sampleCount++;

  for (let t = 0; t + 2 < count && sampleCount < maxSamples * 1.5; t += 3 * step) sampleCount++;

  const samples = new Float32Array(sampleCount * 3);
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
