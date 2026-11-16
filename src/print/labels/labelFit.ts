import { textWidth } from './labelFont';
import { boundaryClearance, type LabelBox } from './labelBoundary';
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

export function labelBox(spot: Pick<LabelSpot, 'at' | 'height' | 'turned'>, width: number): LabelBox {
  const pad = padOf(spot.height);
  const along = (width * spot.height) / 2 + pad;
  const across = spot.height / 2 + pad;
  const [hx, hy] = spot.turned ? [across, along] : [along, across];

  return { minX: spot.at[0] - hx, maxX: spot.at[0] + hx, minY: spot.at[1] - hy, maxY: spot.at[1] + hy };
}

function tallest(
  clear: (box: LabelBox) => boolean,
  spot: { at: [number, number]; turned: boolean },
  width: number,
): number {
  const fits = (height: number) => clear(labelBox({ ...spot, height }, width));

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

function* candidateCenters(face: FlatFace): Generator<[number, number]> {
  if (insideFace(face, face.centroid)) yield face.centroid;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < face.tris.length; i += 2) {
    const x = face.tris[i];
    const y = face.tris[i + 1];

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const grid: Array<[number, number]> = [];

  for (let i = 0; i <= GRID; i++)
    for (let j = 0; j <= GRID; j++) grid.push([minX + ((maxX - minX) * i) / GRID, minY + ((maxY - minY) * j) / GRID]);

  const [cx, cy] = face.centroid;
  const distance = ([x, y]: [number, number]) => Math.hypot(x - cx, y - cy);

  grid.sort((a, b) => distance(a) - distance(b) || a[0] - b[0] || a[1] - b[1]);

  for (const point of grid) if (insideFace(face, point)) yield point;
}

export function fitLabel(face: FlatFace, text: string): LabelSpot | null {
  const width = textWidth(text);
  const clear = boundaryClearance(face.edges);
  let best: LabelSpot | null = null;

  for (const at of candidateCenters(face)) {
    for (const turned of [false, true]) {
      const height = tallest(clear, { at, turned }, width);

      if (height > (best?.height ?? 0) + 1e-6) best = { at, turned, height, stroke: strokeOf(height) };
    }

    if (best?.height === LABEL_MM.maxHeight) return best;
  }

  return best;
}
