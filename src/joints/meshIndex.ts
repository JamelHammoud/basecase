import { Triangle, Vector3 } from 'three';

export type V3 = [number, number, number];

const WELD_MM = 1e-3;
const MIN_AREA = 1e-9;
const SMOOTH_COS = Math.cos((65 * Math.PI) / 180);
const CREASE_COS = Math.cos((0.25 * Math.PI) / 180);

export class MeshIndex {
  readonly positions: Float32Array;
  readonly triangles: number;
  readonly corners: Uint32Array;
  readonly vertices: Float64Array;
  readonly normals: Float64Array;
  readonly areas: Float64Array;
  readonly neighbours: number[][];
  readonly curved: Uint8Array;

  constructor(positions: Float32Array) {
    this.positions = positions;
    this.triangles = Math.floor(positions.length / 9);
    this.corners = new Uint32Array(this.triangles * 3);
    this.normals = new Float64Array(this.triangles * 3);
    this.areas = new Float64Array(this.triangles);
    this.vertices = this.weld();
    this.faceNormals();
    this.neighbours = this.adjacency();
    this.curved = this.curvature();
  }

  normal(t: number): V3 {
    return [this.normals[t * 3], this.normals[t * 3 + 1], this.normals[t * 3 + 2]];
  }

  vertex(v: number): V3 {
    return [this.vertices[v * 3], this.vertices[v * 3 + 1], this.vertices[v * 3 + 2]];
  }

  cosBetween(a: number, b: number): number {
    const n = this.normals;

    return n[a * 3] * n[b * 3] + n[a * 3 + 1] * n[b * 3 + 1] + n[a * 3 + 2] * n[b * 3 + 2];
  }

  smooth(a: number, b: number): boolean {
    return this.cosBetween(a, b) > SMOOTH_COS;
  }

  nearestTriangle(point: V3): number {
    const triangle = new Triangle();
    const at = new Vector3(...point);
    const closest = new Vector3();
    let best = -1;
    let bestDistance = Infinity;

    for (let t = 0; t < this.triangles; t++) {
      if (this.areas[t] < MIN_AREA) continue;

      triangle.a.fromArray(this.vertices, this.corners[t * 3] * 3);
      triangle.b.fromArray(this.vertices, this.corners[t * 3 + 1] * 3);
      triangle.c.fromArray(this.vertices, this.corners[t * 3 + 2] * 3);
      triangle.closestPointToPoint(at, closest);

      const d = at.distanceTo(closest);

      if (d < bestDistance) {
        bestDistance = d;
        best = t;
      }
    }

    return best;
  }

  private weld(): Float64Array {
    const ids = new Map<string, number>();
    const out: number[] = [];
    const p = this.positions;

    for (let i = 0; i < this.triangles * 3; i++) {
      const x = p[i * 3];
      const y = p[i * 3 + 1];
      const z = p[i * 3 + 2];
      const key = `${Math.round(x / WELD_MM)},${Math.round(y / WELD_MM)},${Math.round(z / WELD_MM)}`;
      let id = ids.get(key);

      if (id === undefined) {
        id = out.length / 3;
        ids.set(key, id);
        out.push(x, y, z);
      }

      this.corners[i] = id;
    }

    return Float64Array.from(out);
  }

  private faceNormals(): void {
    const p = this.positions;

    for (let t = 0; t < this.triangles; t++) {
      const o = t * 9;
      const ux = p[o + 3] - p[o];
      const uy = p[o + 4] - p[o + 1];
      const uz = p[o + 5] - p[o + 2];
      const vx = p[o + 6] - p[o];
      const vy = p[o + 7] - p[o + 1];
      const vz = p[o + 8] - p[o + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);

      this.areas[t] = length / 2;

      if (length > 0) this.normals.set([nx / length, ny / length, nz / length], t * 3);
    }
  }

  private adjacency(): number[][] {
    const edges = new Map<number, number[]>();
    const count = this.vertices.length / 3;
    const out: number[][] = Array.from({ length: this.triangles }, () => []);

    for (let t = 0; t < this.triangles; t++) {
      if (this.areas[t] < MIN_AREA) continue;

      for (let k = 0; k < 3; k++) {
        const a = this.corners[t * 3 + k];
        const b = this.corners[t * 3 + ((k + 1) % 3)];
        const key = Math.min(a, b) * count + Math.max(a, b);
        const list = edges.get(key);

        if (list) list.push(t);
        else edges.set(key, [t]);
      }
    }

    for (const list of edges.values()) {
      for (const t of list) out[t].push(...list.filter((u) => u !== t));
    }

    return out;
  }

  private curvature(): Uint8Array {
    const out = new Uint8Array(this.triangles);

    for (let t = 0; t < this.triangles; t++) {
      out[t] = this.neighbours[t].some((u) => this.smooth(t, u) && this.cosBetween(t, u) < CREASE_COS) ? 1 : 0;
    }

    return out;
  }
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));
