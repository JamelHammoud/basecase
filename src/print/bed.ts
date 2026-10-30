import type { Point2, PrinterModel } from '../data/printers';

export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Bed {
  name: string;
  width: number;
  depth: number;
  height: number;
  origin: Point2;
  keepOut: Rect[];
}

const EPS = 1e-6;

function bounds(points: Point2[]): Rect {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y };
}

export function insidePolygon([px, py]: Point2, poly: Point2[]): boolean {
  let inside = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + EPS) + xi;

    if (crosses) inside = !inside;
  }

  return inside;
}

const isAxisRect = (poly: Point2[], box: Rect) =>
  poly.every(
    ([x, y]) =>
      (Math.abs(x - box.x) < EPS || Math.abs(x - box.x - box.w) < EPS) &&
      (Math.abs(y - box.y) < EPS || Math.abs(y - box.y - box.d) < EPS),
  );

function inscribedRect(poly: Point2[], box: Rect): Rect {
  if (poly.length === 4 && isAxisRect(poly, box)) return box;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.d / 2;
  const fits = (s: number) =>
    [-1, 1].every((i) =>
      [-1, 1].every((j) =>
        insidePolygon([cx + (i * box.w * s) / 2 - i * 0.01, cy + (j * box.d * s) / 2 - j * 0.01], poly),
      ),
    );
  let lo = 0;
  let hi = 1;

  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;

    if (fits(mid)) lo = mid;
    else hi = mid;
  }

  return { x: cx - (box.w * lo) / 2, y: cy - (box.d * lo) / 2, w: box.w * lo, d: box.d * lo };
}

function clipRect(r: Rect, to: Rect): Rect | null {
  const x = Math.max(r.x, to.x);
  const y = Math.max(r.y, to.y);
  const w = Math.min(r.x + r.w, to.x + to.w) - x;
  const d = Math.min(r.y + r.d, to.y + to.d) - y;

  return w > EPS && d > EPS ? { x, y, w, d } : null;
}

export function bedOf(model: PrinterModel): Bed {
  const box = inscribedRect(model.bed, bounds(model.bed));
  const keepOut = model.keepOut
    .map((poly) => clipRect(bounds(poly), box))
    .filter((r): r is Rect => !!r)
    .map((r) => ({ ...r, x: r.x - box.x, y: r.y - box.y }));

  return { name: model.name, width: box.w, depth: box.d, height: model.height, origin: [box.x, box.y], keepOut };
}

export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x < b.x + b.w + gap - EPS &&
  b.x < a.x + a.w + gap - EPS &&
  a.y < b.y + b.d + gap - EPS &&
  b.y < a.y + a.d + gap - EPS;

const insideBed = (r: Rect, bed: Bed) =>
  r.x >= -EPS && r.y >= -EPS && r.x + r.w <= bed.width + EPS && r.y + r.d <= bed.depth + EPS;

function freeSpot(size: { w: number; d: number }, bed: Bed): Rect | null {
  const { w, d } = size;
  const xs = [0, bed.width - w, ...bed.keepOut.flatMap((k) => [k.x + k.w, k.x - w])];
  const ys = [0, bed.depth - d, ...bed.keepOut.flatMap((k) => [k.y + k.d, k.y - d])];

  for (const x of xs)
    for (const y of ys) {
      const r = { x, y, w, d };

      if (insideBed(r, bed) && !bed.keepOut.some((k) => overlaps(r, k))) return r;
    }

  return null;
}

type Poly = Point2[];

function rotatedRect(w: number, d: number, deg: number, [cx, cy]: Point2): Poly {
  const t = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];

  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Point2);
}

const rectPoly = (r: Rect): Poly => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.d],
  [r.x, r.y + r.d],
];

function axesOf(poly: Poly): Point2[] {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];

    return [q[1] - p[1], p[0] - q[0]] as Point2;
  });
}

function separated(a: Poly, b: Poly): boolean {
  return [...axesOf(a), ...axesOf(b)].some(([ax, ay]) => {
    const project = (poly: Poly) => poly.map(([x, y]) => x * ax + y * ay);
    const pa = project(a);
    const pb = project(b);

    return Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS;
  });
}

function diagonalFits(w: number, d: number, deg: number, bed: Bed): boolean {
  const poly = rotatedRect(w, d, deg, [bed.width / 2, bed.depth / 2]);
  const inside = poly.every(([x, y]) => x >= -EPS && y >= -EPS && x <= bed.width + EPS && y <= bed.depth + EPS);

  return inside && bed.keepOut.every((k) => separated(poly, rectPoly(k)));
}

export interface BedFit {
  yaw: number;
  spot: Rect | null;
}

export function fitOnBed(w: number, d: number, h: number, bed: Bed): BedFit | null {
  if (h > bed.height + EPS) return null;

  const straight = freeSpot({ w, d }, bed);

  if (straight) return { yaw: 0, spot: straight };

  const turned = freeSpot({ w: d, d: w }, bed);

  if (turned) return { yaw: 90, spot: turned };

  for (let deg = 5; deg < 90; deg += 5) if (diagonalFits(w, d, deg, bed)) return { yaw: deg, spot: null };

  return null;
}

export const bedSizeText = (bed: Bed): string =>
  `${Math.round(bed.width)} × ${Math.round(bed.depth)} × ${Math.round(bed.height)} mm`;
