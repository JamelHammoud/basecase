import type * as THREE from 'three';

export const MAX_POINTS = 1_000_000;

export interface PointSink {
  positions: Float32Array;
  colors: Uint8Array;
  sources: Int32Array;
  count: number;
}

export const pointSink = (capacity: number): PointSink => ({
  positions: new Float32Array(capacity * 3),
  colors: new Uint8Array(capacity * 3),
  sources: new Int32Array(capacity),
  count: 0,
});

export const sinkCapacity = (sink: PointSink) => sink.positions.length / 3;

export type Rgb = readonly [number, number, number];

export const ACCENT: Rgb = [13, 153, 255];

export interface Placer {
  e: ArrayLike<number>;
}

export const placer = (matrix: THREE.Matrix4): Placer => ({ e: matrix.elements });

export const local = new Float64Array(3);

export function pushPoint(sink: PointSink, at: Placer, p: ArrayLike<number> = local): number {
  if (sink.count >= sinkCapacity(sink)) return -1;

  const { e } = at;
  const i = sink.count * 3;
  const x = p[0];
  const y = p[1];
  const z = p[2];

  sink.positions[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
  sink.positions[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
  sink.positions[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  sink.count++;

  return i;
}

export function paint(sink: PointSink, i: number, rgb: Rgb) {
  sink.colors[i] = rgb[0];
  sink.colors[i + 1] = rgb[1];
  sink.colors[i + 2] = rgb[2];
}

const TURBO = [
  [48, 18, 59],
  [70, 107, 227],
  [41, 187, 236],
  [49, 242, 153],
  [162, 252, 60],
  [237, 208, 58],
  [251, 128, 34],
  [208, 47, 5],
  [122, 4, 3],
];

export function rampInto(colors: Uint8Array, i: number, t: number) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (TURBO.length - 1);
  const lo = Math.min(Math.floor(x), TURBO.length - 2);
  const w = x - lo;
  const a = TURBO[lo];
  const b = TURBO[lo + 1];

  colors[i] = a[0] + (b[0] - a[0]) * w;
  colors[i + 1] = a[1] + (b[1] - a[1]) * w;
  colors[i + 2] = a[2] + (b[2] - a[2]) * w;
}
