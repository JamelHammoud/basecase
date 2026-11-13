export type Lens = { model: 'pinhole'; hfovDeg: number } | { model: 'fisheye'; fovDeg: number };

export type Dir = [number, number, number];
export type ImagePoint = [number, number];

export const MIN_PINHOLE_DEG = 20;
export const MAX_PINHOLE_DEG = 120;
export const MIN_FISHEYE_DEG = 120;
export const MAX_FISHEYE_DEG = 240;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampLens(lens: Lens): Lens {
  if (lens.model === 'fisheye')
    return { model: 'fisheye', fovDeg: clamp(lens.fovDeg, MIN_FISHEYE_DEG, MAX_FISHEYE_DEG) };

  return { model: 'pinhole', hfovDeg: clamp(lens.hfovDeg, MIN_PINHOLE_DEG, MAX_PINHOLE_DEG) };
}

export const horizontalDeg = (lens: Lens) => (lens.model === 'fisheye' ? lens.fovDeg : lens.hfovDeg);

export function verticalDeg(lens: Lens, aspect: number): number {
  if (lens.model === 'fisheye') return lens.fovDeg / aspect;

  return deg(2 * Math.atan(Math.tan(rad(lens.hfovDeg) / 2) / aspect));
}

function pinholeDirection(hfovDeg: number, [u, v]: ImagePoint, aspect: number): Dir {
  const t = Math.tan(rad(hfovDeg) / 2);
  const x = u * t;
  const y = (v * t) / aspect;
  const n = Math.hypot(x, y, 1);

  return [x / n, y / n, -1 / n];
}

function fisheyeDirection(fovDeg: number, [u, v]: ImagePoint, aspect: number): Dir | null {
  const y = v / aspect;
  const rho = Math.hypot(u, y);

  if (rho > 1) return null;

  if (rho === 0) return [0, 0, -1];

  const theta = rho * (rad(fovDeg) / 2);
  const s = Math.sin(theta) / rho;

  return [u * s, y * s, -Math.cos(theta)];
}

export function lensDirection(lens: Lens, point: ImagePoint, aspect: number): Dir | null {
  if (lens.model === 'fisheye') return fisheyeDirection(lens.fovDeg, point, aspect);

  return pinholeDirection(lens.hfovDeg, point, aspect);
}

function pinholePoint(hfovDeg: number, [x, y, z]: Dir, aspect: number): ImagePoint | null {
  if (z >= 0) return null;

  const t = Math.tan(rad(hfovDeg) / 2);

  return [x / -z / t, ((y / -z) * aspect) / t];
}

function fisheyePoint(fovDeg: number, [x, y, z]: Dir, aspect: number): ImagePoint | null {
  const n = Math.hypot(x, y, z);

  if (n === 0) return null;

  const theta = Math.acos(clamp(-z / n, -1, 1));
  const rho = theta / (rad(fovDeg) / 2);

  if (rho > 1) return null;

  const side = Math.hypot(x, y);

  if (side === 0) return [0, 0];

  return [(rho * x) / side, ((rho * y) / side) * aspect];
}

export function lensPoint(lens: Lens, dir: Dir, aspect: number): ImagePoint | null {
  if (lens.model === 'fisheye') return fisheyePoint(lens.fovDeg, dir, aspect);

  return pinholePoint(lens.hfovDeg, dir, aspect);
}

export function gridPoints(cols: number, rows: number): ImagePoint[] {
  const out: ImagePoint[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push([((c + 0.5) / cols) * 2 - 1, 1 - ((r + 0.5) / rows) * 2]);
  }

  return out;
}

export const lensLabel = (lens: Lens) =>
  lens.model === 'fisheye' ? `Fisheye ${Math.round(lens.fovDeg)}°` : `${Math.round(lens.hfovDeg)}°`;
