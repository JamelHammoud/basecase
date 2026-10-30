import { maskBounds, type Mask, type MaskBox } from './silhouetteProfile';

export interface ScaledMask {
  mask: Mask;
  mmPerPx: number;
}

export interface Grid {
  width: number;
  height: number;
  cellMm: number;
  target: Uint8Array;
  model: Uint8Array;
}

export interface TargetBand {
  band: number;
  targetMm: number;
  modelMm: number;
}

export interface TargetFit {
  iou: number;
  scaledToHeight: boolean;
  targetSize: [number, number];
  modelSize: [number, number];
  bands: TargetBand[];
  gapMeanMm: number;
  gapMaxMm: number;
  corners: { target: { top: number; bottom: number }; model: { top: number; bottom: number } };
  grid: Grid;
}

const GRID_CELLS = 240;
const PAD = 8;
const SHIFT = 4;

function sizeOf(box: MaskBox) {
  return { w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 };
}

interface Placement {
  mask: Mask;
  box: MaskBox;
  mmPerPx: number;
}

function rasterize(grid: { width: number; height: number; cellMm: number }, place: Placement, dx = 0, dy = 0) {
  const out = new Uint8Array(grid.width * grid.height);
  const { w, h } = sizeOf(place.box);
  const cellsW = (w * place.mmPerPx) / grid.cellMm;
  const cellsH = (h * place.mmPerPx) / grid.cellMm;
  const left = Math.round((grid.width - cellsW) / 2) + dx;
  const top = Math.round((grid.height - cellsH) / 2) + dy;
  const pxPerCell = grid.cellMm / place.mmPerPx;

  for (let gy = Math.max(0, top); gy < Math.min(grid.height, top + Math.ceil(cellsH)); gy++) {
    const sy = place.box.y0 + Math.min(h - 1, Math.floor((gy - top + 0.5) * pxPerCell));

    for (let gx = Math.max(0, left); gx < Math.min(grid.width, left + Math.ceil(cellsW)); gx++) {
      const sx = place.box.x0 + Math.min(w - 1, Math.floor((gx - left + 0.5) * pxPerCell));

      out[gy * grid.width + gx] = place.mask.data[sy * place.mask.width + sx];
    }
  }

  return out;
}

function iouOf(a: Uint8Array, b: Uint8Array): number {
  let both = 0,
    any = 0;

  for (let i = 0; i < a.length; i++) {
    both += a[i] & b[i];
    any += a[i] | b[i];
  }

  return any ? both / any : 0;
}

function bestShift(grid: { width: number; height: number; cellMm: number }, target: Placement, model: Uint8Array) {
  let best = { iou: -1, cells: model };

  for (let dy = -SHIFT; dy <= SHIFT; dy++)
    for (let dx = -SHIFT; dx <= SHIFT; dx++) {
      const cells = rasterize(grid, target, dx, dy);
      const iou = iouOf(cells, model);

      if (iou > best.iou) best = { iou, cells };
    }

  return best;
}

function rowSpan(cells: Uint8Array, width: number, y: number): number {
  let l = -1,
    r = -1;

  for (let x = 0; x < width; x++) {
    if (!cells[y * width + x]) continue;

    if (l < 0) l = x;

    r = x;
  }

  return l < 0 ? 0 : r - l + 1;
}

function bandWidthsMm(grid: Grid, cells: Uint8Array, rows: { y0: number; y1: number }): number[] {
  const H = rows.y1 - rows.y0 + 1;
  const out: number[] = [];

  for (let b = 0; b < 10; b++) {
    let widest = 0;

    for (let y = rows.y0 + Math.floor((b * H) / 10); y < rows.y0 + Math.floor(((b + 1) * H) / 10); y++)
      widest = Math.max(widest, rowSpan(cells, grid.width, y));

    out.push(widest * grid.cellMm);
  }

  return out;
}

function isEdge(cells: Uint8Array, width: number, i: number): boolean {
  if (!cells[i]) return false;

  const x = i % width;

  return x === 0 || x === width - 1 || !cells[i - 1] || !cells[i + 1] || !cells[i - width] || !cells[i + width];
}

export function distanceToEdge(cells: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height).fill(1e9);

  for (let i = width; i < width * (height - 1); i++) if (isEdge(cells, width, i)) d[i] = 0;

  const step = (i: number, j: number, cost: number) => {
    if (d[j] + cost < d[i]) d[i] = d[j] + cost;
  };

  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;

      step(i, i - 1, 1);
      step(i, i - width, 1);
      step(i, i - width - 1, Math.SQRT2);
      step(i, i - width + 1, Math.SQRT2);
    }

  for (let y = height - 2; y > 0; y--)
    for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;

      step(i, i + 1, 1);
      step(i, i + width, 1);
      step(i, i + width + 1, Math.SQRT2);
      step(i, i + width - 1, Math.SQRT2);
    }

  return d;
}

function edgeGap(grid: Grid): { mean: number; max: number } {
  const toModel = distanceToEdge(grid.model, grid.width, grid.height);
  const toTarget = distanceToEdge(grid.target, grid.width, grid.height);
  let sum = 0,
    n = 0,
    max = 0;

  for (let i = grid.width; i < grid.width * (grid.height - 1); i++) {
    const fromTarget = isEdge(grid.target, grid.width, i) ? toModel[i] : -1;
    const fromModel = isEdge(grid.model, grid.width, i) ? toTarget[i] : -1;

    for (const v of [fromTarget, fromModel]) {
      if (v < 0) continue;

      sum += v;
      n++;
      max = Math.max(max, v);
    }
  }

  return { mean: n ? (sum / n) * grid.cellMm : 0, max: max * grid.cellMm };
}

function emptyFromCorner(
  cells: Uint8Array,
  width: number,
  corner: { x: number; y: number; sx: number; sy: number },
  reach: number,
) {
  const seen = new Set<number>();
  const stack = [[corner.x, corner.y]];

  while (stack.length) {
    const [x, y] = stack.pop()!;
    const i = y * width + x;
    const inside = Math.abs(x - corner.x) < reach && Math.abs(y - corner.y) < reach;

    if (!inside || seen.has(i) || cells[i]) continue;

    seen.add(i);
    stack.push([x + corner.sx, y], [x, y + corner.sy]);
  }

  return seen.size;
}

const CORNER_FACTOR = 1 - Math.PI / 4;

export function cornerRadii(cells: Uint8Array, width: number, cellMm: number) {
  const box = maskBounds({ data: cells, width, height: cells.length / width });

  if (box.x1 < 0) return { top: 0, bottom: 0 };

  const { w, h } = sizeOf(box);
  const reach = Math.floor(Math.min(w, h) / 2);
  const radius = (x: number, y: number, sx: number, sy: number) =>
    Math.sqrt(emptyFromCorner(cells, width, { x, y, sx, sy }, reach) / CORNER_FACTOR) * cellMm;

  return {
    top: (radius(box.x0, box.y0, 1, 1) + radius(box.x1, box.y0, -1, 1)) / 2,
    bottom: (radius(box.x0, box.y1, 1, -1) + radius(box.x1, box.y1, -1, -1)) / 2,
  };
}

interface FitRequest {
  target: Mask;
  model: ScaledMask;
  targetMmPerPx?: number | null;
}

export function fitTarget({ target, model, targetMmPerPx }: FitRequest): TargetFit | null {
  const tBox = maskBounds(target);
  const mBox = maskBounds(model.mask);

  if (tBox.x1 < 0 || mBox.x1 < 0) return null;

  const t = sizeOf(tBox);
  const m = sizeOf(mBox);
  const modelSize: [number, number] = [m.w * model.mmPerPx, m.h * model.mmPerPx];
  const tScale = targetMmPerPx ?? modelSize[1] / t.h;
  const targetSize: [number, number] = [t.w * tScale, t.h * tScale];
  const cellMm = Math.max(...modelSize, ...targetSize) / GRID_CELLS;
  const base = {
    width: Math.ceil(Math.max(modelSize[0], targetSize[0]) / cellMm) + 2 * PAD,
    height: Math.ceil(Math.max(modelSize[1], targetSize[1]) / cellMm) + 2 * PAD,
    cellMm,
  };
  const modelCells = rasterize(base, { mask: model.mask, box: mBox, mmPerPx: model.mmPerPx });
  const shifted = bestShift(base, { mask: target, box: tBox, mmPerPx: tScale }, modelCells);
  const grid: Grid = { ...base, target: shifted.cells, model: modelCells };
  const rows = maskBounds({ data: grid.target, width: grid.width, height: grid.height });
  const targetBands = bandWidthsMm(grid, grid.target, rows);
  const modelBands = bandWidthsMm(grid, grid.model, rows);
  const gap = edgeGap(grid);

  return {
    iou: shifted.iou,
    scaledToHeight: !targetMmPerPx,
    targetSize,
    modelSize,
    bands: targetBands.map((targetMm, band) => ({ band, targetMm, modelMm: modelBands[band] })),
    gapMeanMm: gap.mean,
    gapMaxMm: gap.max,
    corners: {
      target: cornerRadii(grid.target, grid.width, cellMm),
      model: cornerRadii(grid.model, grid.width, cellMm),
    },
    grid,
  };
}

export function overlayPixels(grid: Grid, scale = 3): ImageData {
  const W = grid.width * scale,
    H = grid.height * scale;
  const pixels = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = Math.floor(y / scale) * grid.width + Math.floor(x / scale);
      const t = grid.target[i],
        m = grid.model[i];
      const o = (y * W + x) * 4;
      const rgb = overlayColor(t, m);

      pixels.set([rgb[0], rgb[1], rgb[2], 255], o);
    }

  return new ImageData(pixels, W, H);
}

function overlayColor(target: number, model: number): [number, number, number] {
  if (target && model) return [150, 150, 150];

  if (target) return [235, 64, 52];

  return model ? [13, 153, 255] : [24, 24, 24];
}
