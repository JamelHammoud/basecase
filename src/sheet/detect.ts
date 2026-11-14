import { closedLoops, type Edge2 } from './loops';

export type Point2 = [number, number];

export interface SheetProfile {
  thicknessMm: number;
  outline: Point2[];
  holes: Point2[][];
  areaMm2: number;
}

type V3 = [number, number, number];

export const MAX_SHEET_MM = 20;

const FLAT = 1 - 1e-4;
const WALL = 1e-3;
const HEIGHT_TOL = 0.005;
const AREA_TOL = 0.005;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3) => scale(a, 1 / (length(a) || 1));
const quantize = (v: number) => Math.round(v * 1000) + 0;

interface Tri {
  at: number;
  normal: V3;
  area: number;
}

function vertex(t: Float32Array, at: number, k: number): V3 {
  const i = at + k * 3;

  return [t[i], t[i + 1], t[i + 2]];
}

function trianglesOf(t: Float32Array): Tri[] {
  const out: Tri[] = [];

  for (let at = 0; at + 9 <= t.length; at += 9) {
    const a = vertex(t, at, 0);
    const b = vertex(t, at, 1);
    const c = vertex(t, at, 2);
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const area = length(n) / 2;

    if (area > 1e-9) out.push({ at, normal: unit(n), area });
  }

  return out;
}

function dominantNormal(tris: Tri[]): V3 | null {
  const groups = new Map<string, { area: number; sum: V3 }>();

  for (const tri of tris) {
    const key = tri.normal.map(quantize).join(',');
    const g = groups.get(key) ?? { area: 0, sum: [0, 0, 0] };

    g.area += tri.area;
    g.sum = [
      g.sum[0] + tri.normal[0] * tri.area,
      g.sum[1] + tri.normal[1] * tri.area,
      g.sum[2] + tri.normal[2] * tri.area,
    ];
    groups.set(key, g);
  }

  const best = [...groups.values()].reduce<{ area: number; sum: V3 } | null>(
    (top, g) => (!top || g.area > top.area + 1e-6 ? g : top),
    null,
  );

  if (!best) return null;

  const n = unit(best.sum);
  const major = n.reduce((m, v, i) => (Math.abs(v) > Math.abs(n[m]) ? i : m), 0);

  return n[major] < 0 ? scale(n, -1) : n;
}

interface Caps {
  top: Tri[];
  bottom: Tri[];
  hTop: number;
  hBottom: number;
}

function heightsOf(t: Float32Array, tri: Tri, n: V3) {
  return [0, 1, 2].map((k) => dot(vertex(t, tri.at, k), n));
}

function capHeight(t: Float32Array, caps: Tri[], n: V3): number | null {
  if (!caps.length) return null;

  const heights = caps.flatMap((tri) => heightsOf(t, tri, n));
  const h = heights[0];

  return heights.every((x) => Math.abs(x - h) <= HEIGHT_TOL) ? h : null;
}

function splitCaps(t: Float32Array, tris: Tri[], n: V3): Caps | null {
  const top: Tri[] = [];
  const bottom: Tri[] = [];

  for (const tri of tris) {
    const d = dot(tri.normal, n);

    if (Math.abs(d) < WALL) continue;

    if (Math.abs(d) < FLAT) return null;

    (d > 0 ? top : bottom).push(tri);
  }

  const hTop = capHeight(t, top, n);
  const hBottom = capHeight(t, bottom, n);

  return hTop === null || hBottom === null ? null : { top, bottom, hTop, hBottom };
}

function planeAxes(n: V3): [V3, V3] {
  const axes: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const across = axes.reduce((best, a) => (Math.abs(dot(a, n)) < Math.abs(dot(best, n)) - 1e-9 ? a : best), axes[0]);
  const u = unit([
    across[0] - n[0] * dot(across, n),
    across[1] - n[1] * dot(across, n),
    across[2] - n[2] * dot(across, n),
  ]);

  return [u, cross(n, u)];
}

function capEdges(t: Float32Array, top: Tri[], n: V3): Edge2[] {
  const [u, v] = planeAxes(n);
  const edges: Edge2[] = [];

  for (const tri of top) {
    const pts = [0, 1, 2].map((k): Point2 => {
      const p = vertex(t, tri.at, k);

      return [dot(p, u), dot(p, v)];
    });

    edges.push([pts[0], pts[1]], [pts[1], pts[2]], [pts[2], pts[0]]);
  }

  return edges;
}

const sum = (tris: Tri[]) => tris.reduce((s, tri) => s + tri.area, 0);

function signedArea(loop: Point2[]): number {
  let a = 0;

  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];

    a += x1 * y2 - x2 * y1;
  }

  return a / 2;
}

function inside(p: Point2, loop: Point2[]): boolean {
  let hit = false;

  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];

    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }

  return hit;
}

function startAtLowest(loop: Point2[]): Point2[] {
  const at = loop.reduce((best, p, i) => {
    const b = loop[best];

    return p[1] < b[1] - 1e-9 || (Math.abs(p[1] - b[1]) <= 1e-9 && p[0] < b[0]) ? i : best;
  }, 0);

  return [...loop.slice(at), ...loop.slice(0, at)];
}

function oriented(loop: Point2[], ccw: boolean): Point2[] {
  return signedArea(loop) > 0 === ccw ? loop : [...loop].reverse();
}

const shifted = (loop: Point2[], by: Point2): Point2[] => loop.map(([x, y]) => [x - by[0], y - by[1]]);

function lowestFirst(a: Point2[], b: Point2[]) {
  return a[0][1] - b[0][1] || a[0][0] - b[0][0];
}

function profileOf(loops: Point2[][], capArea: number, thicknessMm: number): SheetProfile | null {
  const byArea = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const [outer, ...holes] = byArea;
  const area = Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);

  if (!holes.every((h) => inside(h[0], outer))) return null;

  if (Math.abs(area - capArea) > capArea * AREA_TOL + 0.01) return null;

  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const min: Point2 = [Math.min(...xs), Math.min(...ys)];
  const narrow = Math.min(Math.max(...xs) - min[0], Math.max(...ys) - min[1]);

  if (narrow < thicknessMm * 2) return null;

  return {
    thicknessMm,
    outline: startAtLowest(shifted(oriented(outer, true), min)),
    holes: holes.map((h) => startAtLowest(shifted(oriented(h, false), min))).sort(lowestFirst),
    areaMm2: area,
  };
}

export function sheetProfile(triangles: Float32Array): SheetProfile | null {
  const tris = trianglesOf(triangles);
  const n = dominantNormal(tris);
  const caps = n && splitCaps(triangles, tris, n);

  if (!n || !caps) return null;

  const thicknessMm = caps.hTop - caps.hBottom;
  const capArea = sum(caps.top);

  if (thicknessMm <= 0 || thicknessMm > MAX_SHEET_MM) return null;

  if (Math.abs(capArea - sum(caps.bottom)) > capArea * AREA_TOL + 0.01) return null;

  const loops = closedLoops(capEdges(triangles, caps.top, n));

  return loops?.length ? profileOf(loops, capArea, thicknessMm) : null;
}
