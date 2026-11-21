import { maskBounds, type Mask, type MaskBox } from './silhouetteProfile';
import { maskRows, rowBandWidths } from './maskRows';

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

function rasterize(grid: { width: number; height: number; cellMm: number }, place: Placement) {
  const out = new Uint8Array(grid.width * grid.height);
  const { w, h } = sizeOf(place.box);
  const cellsW = (w * place.mmPerPx) / grid.cellMm;
  const cellsH = (h * place.mmPerPx) / grid.cellMm;
  const left = Math.round((grid.width - cellsW) / 2);
  const top = Math.round((grid.height - cellsH) / 2);
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

function shiftScorer(target: Uint8Array, model: Uint8Array) {
  const occupied: number[] = [];
  let total = 0;

  for (let i = 0; i < target.length; i++) {
    total += target[i] + model[i];

    if (target[i]) occupied.push(i);
  }

  const score = (offset: number) => {
    let both = 0;

    for (const i of occupied) both += target[i] & model[i + offset];

    return total ? both / (total - both) : 0;
  };

  return { occupied, score };
}

function bestShift(grid: { width: number; height: number; cellMm: number }, target: Placement, model: Uint8Array) {
  const source = rasterize(grid, target);
  const { occupied, score } = shiftScorer(source, model);
  let best = { iou: -1, offset: 0 };

  for (let dy = -SHIFT; dy <= SHIFT && best.iou < 1; dy++)
    for (let dx = -SHIFT; dx <= SHIFT && best.iou < 1; dx++) {
      const offset = dy * grid.width + dx;
      const iou = score(offset);

      if (iou > best.iou) best = { iou, offset };
    }

  const cells = new Uint8Array(source.length);

  for (const i of occupied) cells[i + best.offset] = source[i];

  return { iou: best.iou, cells };
}

function isEdge(cells: Uint8Array, width: number, i: number): boolean {
  if (!cells[i]) return false;

  const x = i % width;

  return x === 0 || x === width - 1 || !cells[i - 1] || !cells[i + 1] || !cells[i - width] || !cells[i + width];
}

export function distanceToEdge(cells: Uint8Array, width: number, height: number): Float32Array {
  const d = new Float32Array(width * height).fill(1e9);

  for (let i = width; i < width * (height - 1); i++) if (isEdge(cells, width, i)) d[i] = 0;

  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const nearest = Math.min(
        d[i - 1] + 1,
        d[i - width] + 1,
        d[i - width - 1] + Math.SQRT2,
        d[i - width + 1] + Math.SQRT2,
      );

      if (nearest < d[i]) d[i] = nearest;
    }

  for (let y = height - 2; y > 0; y--)
    for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;
      const nearest = Math.min(
        d[i + 1] + 1,
        d[i + width] + 1,
        d[i + width + 1] + Math.SQRT2,
        d[i + width - 1] + Math.SQRT2,
      );

      if (nearest < d[i]) d[i] = nearest;
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

    if (fromTarget >= 0) {
      sum += fromTarget;
      n++;
      max = Math.max(max, fromTarget);
    }

    if (fromModel >= 0) {
      sum += fromModel;
      n++;
      max = Math.max(max, fromModel);
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
  if (reach <= 0) return 0;

  const seen = new Set<number>();
  const stack: number[] = [];
  const endX = corner.x + corner.sx * reach;
  const endY = corner.y + corner.sy * reach;
  let pixels = 0;
  const offer = (i: number) => {
    if (seen.has(i)) return;

    seen.add(i);

    if (!cells[i]) stack.push(i);
  };

  offer(corner.y * width + corner.x);

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = Math.floor(i / width);

    pixels++;

    if (x + corner.sx !== endX) offer(i + corner.sx);

    if (y + corner.sy !== endY) offer(i + corner.sy * width);
  }

  return pixels;
}

const CORNER_FACTOR = 1 - Math.PI / 4;

export function cornerRadii(cells: Uint8Array, width: number, cellMm: number) {
  const box = maskBounds({ data: cells, width, height: cells.length / width });

  return radiiInBox({ cells, width, cellMm, box });
}

function radiiInBox({ cells, width, cellMm, box }: { cells: Uint8Array; width: number; cellMm: number; box: MaskBox }) {
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
  const targetRows = maskRows({ data: grid.target, width: grid.width, height: grid.height });
  const modelRows = maskRows({ data: grid.model, width: grid.width, height: grid.height });
  const targetBands = rowBandWidths(targetRows.rows, targetRows.box);
  const modelBands = rowBandWidths(modelRows.rows, targetRows.box);
  const gap = edgeGap(grid);

  return {
    iou: shifted.iou,
    scaledToHeight: !targetMmPerPx,
    targetSize,
    modelSize,
    bands: targetBands.map((span, band) => ({
      band,
      targetMm: span * cellMm,
      modelMm: modelBands[band] * cellMm,
    })),
    gapMeanMm: gap.mean,
    gapMaxMm: gap.max,
    corners: {
      target: radiiInBox({ cells: grid.target, width: grid.width, cellMm, box: targetRows.box }),
      model: radiiInBox({ cells: grid.model, width: grid.width, cellMm, box: modelRows.box }),
    },
    grid,
  };
}

const OVERLAY_COLORS = [
  [24, 24, 24, 255],
  [13, 153, 255, 255],
  [235, 64, 52, 255],
  [150, 150, 150, 255],
] as const;

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
      const color = OVERLAY_COLORS[(t ? 2 : 0) + (m ? 1 : 0)];

      pixels.set(color, o);
    }

  return new ImageData(pixels, W, H);
}
