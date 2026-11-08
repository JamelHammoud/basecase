import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type Faces = { centers: Float32Array; normals: Float32Array; areas: Float32Array };

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
    return this.faces.areas.reduce((s, x) => s + x, 0);
  }

  dispose(): void {
    this.tree?.geometry.dispose();
  }
}

const FACE_TARGET = 1500;
const MIN_FACE_AREA = 0.5;
const FACE_PIECE_MM2 = 25;
const MAX_FACE_SPLITS = 12;

function pieceCenters({ a, b, c }: THREE.Triangle, n: number): THREE.Vector3[] {
  const at = (u: number, v: number, w: number) =>
    new THREE.Vector3()
      .addScaledVector(a, u / n)
      .addScaledVector(b, v / n)
      .addScaledVector(c, w / n);
  const out: THREE.Vector3[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const k = n - 1 - i - j;

      out.push(at(i + 1 / 3, j + 1 / 3, k + 1 / 3));

      if (k > 0) out.push(at(i + 2 / 3, j + 2 / 3, k - 1 / 3));
    }
  }

  return out;
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
    n = new THREE.Vector3();
  const tri = new THREE.Triangle(a, b, c);

  for (let t = 0; t + 2 < count; t += 3 * step) {
    a.fromArray(positions, t * 3);
    b.fromArray(positions, t * 3 + 3);
    c.fromArray(positions, t * 3 + 6);

    const area = tri.getArea();

    if (area < MIN_FACE_AREA) continue;

    const normal = tri.getNormal(n).toArray();
    const splits = Math.min(MAX_FACE_SPLITS, Math.ceil(Math.sqrt(area / FACE_PIECE_MM2)));

    for (const center of pieceCenters(tri, splits)) {
      centers.push(center.x, center.y, center.z);
      normals.push(...normal);
      areas.push((area * step) / (splits * splits));
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
  const out: number[] = [];

  for (let i = 0; i < count; i += step) out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);

  for (let t = 0; t + 2 < count && out.length / 3 < maxSamples * 1.5; t += 3 * step) {
    for (let k = 0; k < 3; k++) out.push((pos[t * 3 + k] + pos[t * 3 + 3 + k] + pos[t * 3 + 6 + k]) / 3);
  }

  const samples = new Float32Array(out);

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
