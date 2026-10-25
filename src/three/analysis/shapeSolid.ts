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

function faceData(positions: Float32Array): Faces {
  const count = positions.length / 3;
  const step = Math.max(1, Math.floor(count / 3 / FACE_TARGET));
  const centers: number[] = [];
  const normals: number[] = [];
  const areas: number[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    v = new THREE.Vector3();
  const tri = new THREE.Triangle(a, b, c);

  for (let t = 0; t + 2 < count; t += 3 * step) {
    a.fromArray(positions, t * 3);
    b.fromArray(positions, t * 3 + 3);
    c.fromArray(positions, t * 3 + 6);

    const area = tri.getArea();

    if (area < MIN_FACE_AREA) continue;

    centers.push(...tri.getMidpoint(v).toArray());
    normals.push(...tri.getNormal(v).toArray());
    areas.push(area * step);
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
