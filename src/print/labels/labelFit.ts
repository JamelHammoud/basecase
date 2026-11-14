import { textWidth } from './labelFont';
import type { FlatFace } from './labelFaces';

export interface LabelSpot {
  at: [number, number];
  height: number;
  stroke: number;
  turned: boolean;
}

export const LABEL_MM = { minHeight: 4, maxHeight: 10, wall: 0.8, depth: 0.4, lift: 0.3 };

const GRID = 8;
const SEARCH_STEPS = 12;

export const strokeOf = (height: number) => Math.min(1.4, Math.max(0.8, height * 0.14));

const padOf = (height: number) => strokeOf(height) + LABEL_MM.wall;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clipAxis(range: { t0: number; t1: number }, p: number, q: number): boolean {
  if (p === 0) return q >= 0;

  const r = q / p;

  if (p < 0) range.t0 = Math.max(range.t0, r);
  else range.t1 = Math.min(range.t1, r);

  return range.t0 <= range.t1;
}

function segmentHitsBox(edges: Float32Array, i: number, box: Box): boolean {
  const [x0, y0, x1, y1] = [edges[i], edges[i + 1], edges[i + 2], edges[i + 3]];
  const range = { t0: 0, t1: 1 };
  const dx = x1 - x0;
  const dy = y1 - y0;

  return (
    clipAxis(range, -dx, x0 - box.minX) &&
    clipAxis(range, dx, box.maxX - x0) &&
    clipAxis(range, -dy, y0 - box.minY) &&
    clipAxis(range, dy, box.maxY - y0)
  );
}

function inTriangle(tris: Float32Array, i: number, [x, y]: [number, number]): boolean {
  const [ax, ay, bx, by, cx, cy] = [tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5]];
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;

  return !(negative && positive);
}

export function insideFace(face: FlatFace, point: [number, number]): boolean {
  for (let i = 0; i < face.tris.length; i += 6) if (inTriangle(face.tris, i, point)) return true;

  return false;
}

function boxClear(face: FlatFace, box: Box): boolean {
  for (let i = 0; i < face.edges.length; i += 4) if (segmentHitsBox(face.edges, i, box)) return false;

  return true;
}

export function labelBox(spot: Pick<LabelSpot, 'at' | 'height' | 'turned'>, width: number): Box {
  const pad = padOf(spot.height);
  const along = (width * spot.height) / 2 + pad;
  const across = spot.height / 2 + pad;
  const [hx, hy] = spot.turned ? [across, along] : [along, across];

  return { minX: spot.at[0] - hx, maxX: spot.at[0] + hx, minY: spot.at[1] - hy, maxY: spot.at[1] + hy };
}

function tallest(face: FlatFace, spot: { at: [number, number]; turned: boolean }, width: number): number {
  const fits = (height: number) => boxClear(face, labelBox({ ...spot, height }, width));

  if (fits(LABEL_MM.maxHeight)) return LABEL_MM.maxHeight;

  if (!fits(LABEL_MM.minHeight)) return 0;

  let [lo, hi] = [LABEL_MM.minHeight, LABEL_MM.maxHeight];

  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;

    if (fits(mid)) lo = mid;
    else hi = mid;
  }

  return lo;
}

function candidateCenters(face: FlatFace): Array<[number, number]> {
  const xs = face.tris.filter((_, i) => i % 2 === 0);
  const ys = face.tris.filter((_, i) => i % 2 === 1);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const grid: Array<[number, number]> = [];

  for (let i = 0; i <= GRID; i++)
    for (let j = 0; j <= GRID; j++) grid.push([minX + ((maxX - minX) * i) / GRID, minY + ((maxY - minY) * j) / GRID]);

  const [cx, cy] = face.centroid;
  const distance = ([x, y]: [number, number]) => Math.hypot(x - cx, y - cy);

  return [face.centroid, ...grid.sort((a, b) => distance(a) - distance(b) || a[0] - b[0] || a[1] - b[1])].filter((p) =>
    insideFace(face, p),
  );
}

export function fitLabel(face: FlatFace, text: string): LabelSpot | null {
  const width = textWidth(text);
  let best: LabelSpot | null = null;

  for (const at of candidateCenters(face)) {
    for (const turned of [false, true]) {
      const height = tallest(face, { at, turned }, width);

      if (height > (best?.height ?? 0) + 1e-6) best = { at, turned, height, stroke: strokeOf(height) };
    }

    if (best?.height === LABEL_MM.maxHeight) return best;
  }

  return best;
}
