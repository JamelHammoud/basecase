import { MAX_SHEET_MM } from './sheetStock';
import { faceLoops, type Loop } from './sheetLoops';

export type { Loop } from './sheetLoops';

type V3 = [number, number, number];

export interface SheetProfile {
  thickness: number;
  outline: Loop;
  holes: Loop[];
}

const PARALLEL = 1 - 1e-4;
const PERPENDICULAR = 1e-3;
const OFFSET_TOL = 0.01;
const MIN_AREA = 1e-9;
const AREA_TOL = 1e-3;

const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const scale = (p: V3, s: number): V3 => [p[0] * s, p[1] * s, p[2] * s];

type Read = (k: number) => V3;

const corner =
  (t: Float32Array, i: number): Read =>
  (k) => [t[i + k * 3], t[i + k * 3 + 1], t[i + k * 3 + 2]];

function rawNormal(at: Read): V3 {
  const a = at(0);

  return cross(sub(at(1), a), sub(at(2), a));
}

function largestNormal(t: Float32Array): V3 | null {
  let best: V3 | null = null;
  let bestArea = MIN_AREA * 2;

  for (let i = 0; i + 8 < t.length; i += 9) {
    const n = rawNormal(corner(t, i));
    const twice = Math.hypot(...n);

    if (twice > bestArea) [best, bestArea] = [scale(n, 1 / twice), twice];
  }

  return best;
}

function canonical(n: V3): V3 {
  const i = [0, 1, 2].reduce((best, k) => (Math.abs(n[k]) > Math.abs(n[best]) ? k : best), 0);

  return n[i] < 0 ? scale(n, -1) : n;
}

function planeBasis(n: V3): { u: V3; v: V3 } {
  const axes: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const axis = axes.reduce((best, a) => (Math.abs(dot(a, n)) < Math.abs(dot(best, n)) ? a : best), axes[0]);
  const along = sub(axis, scale(n, dot(axis, n)));
  const u = scale(along, 1 / Math.hypot(...along));

  return { u, v: cross(n, u) };
}

interface Span {
  min: number;
  max: number;
  area: number;
}

const grow = (s: Span, offset: number, area: number) => {
  s.min = Math.min(s.min, offset);
  s.max = Math.max(s.max, offset);
  s.area += area;
};

const emptySpan = (): Span => ({ min: Infinity, max: -Infinity, area: 0 });

const flat = (s: Span) => s.area > 0 && s.max - s.min <= OFFSET_TOL;

type Flat = Array<[number, number]>;

interface Faces {
  top: Flat[];
  spans: [Span, Span];
}

function splitFaces(t: Float32Array, n: V3): Faces | null {
  const spans: [Span, Span] = [emptySpan(), emptySpan()];
  const { u, v } = planeBasis(n);
  const top: Flat[] = [];

  for (let i = 0; i + 8 < t.length; i += 9) {
    const at = corner(t, i);
    const raw = rawNormal(at);
    const twice = Math.hypot(...raw);
    const d = twice / 2 > MIN_AREA ? dot(raw, n) / twice : 0;

    if (Math.abs(d) < PERPENDICULAR) continue;

    if (Math.abs(d) < PARALLEL) return null;

    grow(spans[d > 0 ? 0 : 1], dot(at(0), n), twice / 2);

    if (d > 0) top.push([0, 1, 2].map((k) => [dot(at(k), u), dot(at(k), v)] as [number, number]));
  }

  return flat(spans[0]) && flat(spans[1]) ? { top, spans } : null;
}

const sameArea = (a: number, b: number) => Math.abs(a - b) <= AREA_TOL * Math.max(a, b);

export function detectSheet(triangles: Float32Array): SheetProfile | null {
  const largest = largestNormal(triangles);
  const faces = largest && splitFaces(triangles, canonical(largest));

  if (!faces) return null;

  const [top, bottom] = faces.spans;
  const thickness = (top.min + top.max) / 2 - (bottom.min + bottom.max) / 2;

  if (thickness <= OFFSET_TOL || thickness > MAX_SHEET_MM || !sameArea(top.area, bottom.area)) return null;

  const loops = faceLoops(faces.top, top.area);

  return loops && { thickness: Math.round(thickness * 1e4) / 1e4, ...loops };
}
