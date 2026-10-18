import type { AnalyzedImageFeatures } from './imageTo3DAnalyzer';

type Point = [number, number];

type HoleCenter = AnalyzedImageFeatures['detectedHoleCenters'][number];

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

  return '#' + [clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);

  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));

  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 4) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = pointLineDistance(points[i], points[0], points[end]);

    if (dist > dmax) {
      index = i;
      dmax = dist;
    }
  }

  if (dmax <= epsilon) return [points[0], points[end]];

  const rec1 = simplifyPolygon(points.slice(0, index + 1), epsilon);
  const rec2 = simplifyPolygon(points.slice(index), epsilon);

  return rec1.slice(0, rec1.length - 1).concat(rec2);
}

interface ForegroundScan {
  mask: Uint8Array;
  fgCount: number;
  sum: [number, number, number];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function cornerBackground(data: Uint8ClampedArray, grid: number): [number, number, number, number] {
  const corners = [0, (grid - 1) * 4, grid * (grid - 1) * 4, (grid * grid - 1) * 4];
  const bg: [number, number, number, number] = [0, 0, 0, 0];

  for (const idx of corners) for (let k = 0; k < 4; k++) bg[k] += data[idx + k];

  return bg.map((v) => v / 4) as [number, number, number, number];
}

function scanForeground(data: Uint8ClampedArray, grid: number): ForegroundScan {
  const [bgR, bgG, bgB, bgA] = cornerBackground(data, grid);
  const hasAlphaBackground = bgA < 128;
  const isForeground = (i: number) =>
    hasAlphaBackground
      ? data[i + 3] > 90
      : data[i + 3] > 90 && Math.hypot(data[i] - bgR, data[i + 1] - bgG, data[i + 2] - bgB) > 38;
  const scan: ForegroundScan = {
    mask: new Uint8Array(grid * grid),
    fgCount: 0,
    sum: [0, 0, 0],
    minX: grid,
    maxX: 0,
    minY: grid,
    maxY: 0,
  };

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const i = (y * grid + x) * 4;

      if (!isForeground(i)) continue;

      scan.mask[y * grid + x] = 1;
      scan.fgCount++;
      scan.sum[0] += data[i];
      scan.sum[1] += data[i + 1];
      scan.sum[2] += data[i + 2];
      scan.minX = Math.min(scan.minX, x);
      scan.maxX = Math.max(scan.maxX, x);
      scan.minY = Math.min(scan.minY, y);
      scan.maxY = Math.max(scan.maxY, y);
    }
  }

  return scan;
}

interface Frame {
  grid: number;
  cx: number;
  cy: number;
  spanX: number;
  spanY: number;
}

const FALLBACK_OUTLINE: Point[] = [
  [-0.46, -0.36],
  [-0.36, -0.46],
  [0.36, -0.46],
  [0.46, -0.36],
  [0.46, 0.36],
  [0.36, 0.46],
  [-0.36, 0.46],
  [-0.46, 0.36],
];

function furthestOnRay(mask: Uint8Array, f: Frame, cos: number, sin: number): number {
  let furthestR = 0.08 * Math.min(f.spanX, f.spanY);
  const maxRay = Math.hypot(f.grid, f.grid) * 0.6;

  for (let r = 1; r < maxRay; r += 0.75) {
    const sx = Math.round(f.cx + cos * r);
    const sy = Math.round(f.cy + sin * r);

    if (sx < 0 || sx >= f.grid || sy < 0 || sy >= f.grid) break;

    if (mask[sy * f.grid + sx] === 1) furthestR = r;
  }

  return furthestR;
}

function radialOutline(scan: ForegroundScan, f: Frame): Point[] {
  if (!(scan.fgCount > 35 && scan.fgCount < f.grid * f.grid * 0.94)) return [...FALLBACK_OUTLINE];

  const numAngles = 48;
  const points: Point[] = [];

  for (let aIdx = 0; aIdx < numAngles; aIdx++) {
    const theta = (aIdx / numAngles) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const furthestR = furthestOnRay(scan.mask, f, cos, sin);
    const pxNorm = Math.max(-0.49, Math.min(0.49, (cos * furthestR) / f.spanX));
    const pzNorm = Math.max(-0.49, Math.min(0.49, -(sin * furthestR) / f.spanY));

    points.push([Math.round(pxNorm * 1000) / 1000, Math.round(pzNorm * 1000) / 1000]);
  }

  return points;
}

function markOutside(mask: Uint8Array, grid: number): Uint8Array {
  const visited = new Uint8Array(grid * grid);
  const queue: number[] = [];

  for (let x = 0; x < grid; x++) queue.push(x, (grid - 1) * grid + x);

  for (let y = 0; y < grid; y++) queue.push(y * grid, y * grid + (grid - 1));

  while (queue.length > 0) {
    const idx = queue.pop()!;

    if (visited[idx] || mask[idx] === 1) continue;

    visited[idx] = 1;

    const x = idx % grid;
    const y = Math.floor(idx / grid);

    if (x > 0) queue.push(idx - 1);

    if (x < grid - 1) queue.push(idx + 1);

    if (y > 0) queue.push(idx - grid);

    if (y < grid - 1) queue.push(idx + grid);
  }

  return visited;
}

function floodHole(start: number, mask: Uint8Array, visited: Uint8Array, grid: number) {
  let pixels = 0;
  let xSum = 0,
    ySum = 0;
  const queue = [start];
  const open = (n: number) => n >= 0 && n < grid * grid && !visited[n] && mask[n] === 0;

  visited[start] = 1;

  while (queue.length > 0) {
    const curr = queue.pop()!;

    pixels++;
    xSum += curr % grid;
    ySum += Math.floor(curr / grid);

    for (const n of [curr - 1, curr + 1, curr - grid, curr + grid].filter(open)) {
      visited[n] = 1;
      queue.push(n);
    }
  }

  return { pixels, xSum, ySum };
}

function detectHoles(scan: ForegroundScan, f: Frame): HoleCenter[] {
  const { mask, minX, maxX, minY, maxY } = scan;
  const visited = markOutside(mask, f.grid);
  const holes: HoleCenter[] = [];

  for (let y = minY + 1; y < maxY; y++) {
    for (let x = minX + 1; x < maxX; x++) {
      const startIdx = y * f.grid + x;

      if (mask[startIdx] !== 0 || visited[startIdx]) continue;

      const hole = floodHole(startIdx, mask, visited, f.grid);

      if (hole.pixels >= 4 && hole.pixels < f.spanX * f.spanY * 0.35) holes.push(holeCenter(hole, f));
    }
  }

  return holes;
}

function holeCenter({ pixels, xSum, ySum }: { pixels: number; xSum: number; ySum: number }, f: Frame): HoleCenter {
  const xNorm = (xSum / pixels - f.cx) / f.spanX;
  const zNorm = -(ySum / pixels - f.cy) / f.spanY;
  const radiusNorm = Math.sqrt(pixels / Math.PI) / Math.max(f.spanX, f.spanY);

  return {
    xNorm: Math.round(xNorm * 1000) / 1000,
    zNorm: Math.round(zNorm * 1000) / 1000,
    radiusNorm: Math.max(0.035, Math.min(0.18, Math.round(radiusNorm * 1000) / 1000)),
  };
}

function holeLoop(h: HoleCenter): Point[] {
  const segs = 12;
  const loop: Point[] = [];

  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;

    loop.push([
      Math.round((h.xNorm + Math.cos(a) * h.radiusNorm) * 1000) / 1000,
      Math.round((h.zNorm + Math.sin(a) * h.radiusNorm) * 1000) / 1000,
    ]);
  }

  return loop;
}

export interface PixelAnalysisInput {
  data: Uint8ClampedArray;
  gridSize: number;
  imageWidth: number;
  imageHeight: number;
  targetSpanMm: number;
  extrudeHeightMm: number;
}

export function analyzePixels(input: PixelAnalysisInput): AnalyzedImageFeatures {
  const { data, gridSize, imageWidth, imageHeight, targetSpanMm, extrudeHeightMm } = input;
  const scan = scanForeground(data, gridSize);
  const found = scan.fgCount > 20;
  const dominantColor = found
    ? rgbToHex(scan.sum[0] / scan.fgCount, scan.sum[1] / scan.fgCount, scan.sum[2] / scan.fgCount)
    : '#d4d4d8';
  const aspect = imageWidth / Math.max(1, imageHeight);
  const widthMm = aspect >= 1 ? Math.round(targetSpanMm) : Math.max(16, Math.round(targetSpanMm * aspect));
  const depthMm = aspect >= 1 ? Math.max(16, Math.round(targetSpanMm / aspect)) : Math.round(targetSpanMm);
  const frame: Frame = {
    grid: gridSize,
    cx: found ? (scan.minX + scan.maxX) / 2 : gridSize / 2,
    cy: found ? (scan.minY + scan.maxY) / 2 : gridSize / 2,
    spanX: Math.max(12, scan.maxX - scan.minX),
    spanY: Math.max(12, scan.maxY - scan.minY),
  };
  const rawRadialPoints = radialOutline(scan, frame);
  const simplifiedOuter = simplifyPolygon([...rawRadialPoints, rawRadialPoints[0]], 0.022).slice(0, -1);
  const detectedHoleCenters = detectHoles(scan, frame);

  return {
    widthPx: imageWidth,
    heightPx: imageHeight,
    aspectRatio: Math.round(aspect * 100) / 100,
    dominantColor,
    contour: {
      outerLoop: simplifiedOuter.length >= 4 ? simplifiedOuter : rawRadialPoints,
      holes: detectedHoleCenters.slice(0, 6).map(holeLoop),
      bevel: true,
    },
    detectedHoleCenters,
    suggestedDimensions: {
      width: widthMm,
      height: extrudeHeightMm,
      depth: depthMm,
      thickness: 4,
    },
  };
}
