export const MAP_VOXEL_M = 0.05;

const HALF = 65536;
const SPAN = HALF * 2;
const START = 4096;

export interface MapBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface VoxelChanges {
  indices: Uint32Array;
  points: Float32Array;
}

export class Voxels {
  readonly size: number;

  readonly cap: number;

  count = 0;

  private readonly index = new Map<number, number>();

  private sums = new Float64Array(START * 3);

  private hits = new Uint32Array(START);

  private readonly changed: Set<number> | null;

  constructor(size: number, cap: number, trackChanges = false) {
    if (!Number.isFinite(size) || size <= 0) throw new RangeError('Choose a positive voxel width.');

    if (!Number.isSafeInteger(cap) || cap <= 0) throw new RangeError('Choose a positive whole point cap.');

    this.size = size;
    this.cap = cap;
    this.changed = trackChanges ? new Set() : null;
  }

  cell(v: number): number {
    return Math.floor(v / this.size);
  }

  keyOf(ix: number, iy: number, iz: number): number {
    const x = ix + HALF;
    const y = iy + HALF;
    const z = iz + HALF;

    if (x < 0 || y < 0 || z < 0 || x >= SPAN || y >= SPAN || z >= SPAN) return -1;

    return (x * SPAN + y) * SPAN + z;
  }

  at(ix: number, iy: number, iz: number): number {
    const key = this.keyOf(ix, iy, iz);

    return key < 0 ? -1 : (this.index.get(key) ?? -1);
  }

  add(x: number, y: number, z: number): void {
    if (!Number.isFinite(x + y + z)) return;

    const key = this.keyOf(this.cell(x), this.cell(y), this.cell(z));

    const i = key < 0 ? -1 : this.slot(key);

    if (i < 0) return;

    this.sums[i * 3] += x;
    this.sums[i * 3 + 1] += y;
    this.sums[i * 3 + 2] += z;
    this.hits[i]++;
    this.changed?.add(i);
  }

  takeChanges(): VoxelChanges {
    const indices = Uint32Array.from(this.changed ?? []);
    const points = new Float32Array(indices.length * 3);

    indices.forEach((i, at) => {
      const n = this.hits[i];

      for (let axis = 0; axis < 3; axis++) points[at * 3 + axis] = this.sums[i * 3 + axis] / n;
    });
    this.changed?.clear();

    return { indices, points };
  }

  centroid(i: number, out: Float64Array, at = 0): void {
    const n = this.hits[i];

    out[at] = this.sums[i * 3] / n;
    out[at + 1] = this.sums[i * 3 + 1] / n;
    out[at + 2] = this.sums[i * 3 + 2] / n;
  }

  points(from = 0): Float32Array {
    const out = new Float32Array((this.count - from) * 3);

    for (let i = from; i < this.count; i++) {
      const n = this.hits[i];
      const k = (i - from) * 3;

      out[k] = this.sums[i * 3] / n;
      out[k + 1] = this.sums[i * 3 + 1] / n;
      out[k + 2] = this.sums[i * 3 + 2] / n;
    }

    return out;
  }

  private slot(key: number): number {
    const known = this.index.get(key);

    if (known !== undefined) return known;

    if (this.count >= this.cap) return -1;

    const made = this.count++;

    this.index.set(key, made);
    this.room(this.count);

    return made;
  }

  private room(needed: number) {
    if (needed <= this.hits.length) return;

    const grown = Math.min(Math.max(needed, this.hits.length * 2), Math.max(this.cap, needed));
    const sums = new Float64Array(grown * 3);
    const hits = new Uint32Array(grown);

    sums.set(this.sums);
    hits.set(this.hits);
    this.sums = sums;
    this.hits = hits;
  }
}

export function pointBounds(points: ArrayLike<number>): MapBounds | null {
  if (points.length < 3) return null;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < points.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], points[i + a]);
      max[a] = Math.max(max[a], points[i + a]);
    }
  }

  return { min, max };
}
