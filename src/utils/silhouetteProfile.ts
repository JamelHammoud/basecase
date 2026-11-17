import { maskRows, rowBandWidths } from './maskRows';
import { maskRowLeft, maskRowRight } from './maskRowEdges';

export interface Profile {
  bands: number[];
  aspect: number;
}

export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface MaskBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function maskBounds({ data, width: w, height: h }: Mask, region?: MaskBox): MaskBox {
  const left = Math.max(0, region?.x0 ?? 0);
  const right = Math.min(w - 1, region?.x1 ?? w - 1);
  const top = Math.max(0, region?.y0 ?? 0);
  const bottom = Math.min(h - 1, region?.y1 ?? h - 1);
  let x0 = w,
    x1 = -1,
    y0 = h,
    y1 = -1;

  if (left > right || Number.isNaN(left) || Number.isNaN(right)) return { x0, x1, y0, y1 };

  const last = Number.isInteger(left) ? Math.floor(right) : right;

  for (let y = top; y <= bottom; y++) {
    const offset = y * w;
    const first = maskRowLeft(data, offset, left, last);

    if (first < 0) continue;

    x0 = Math.min(x0, first);
    x1 = Math.max(x1, maskRowRight(data, offset, last, first));
    y0 = Math.min(y0, y);
    y1 = y;
  }

  return { x0, x1, y0, y1 };
}

export function maskArea(mask: Mask): number {
  let n = 0;

  for (const v of mask.data) n += v ? 1 : 0;

  return n;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function bandWidths(mask: Mask, bands = 10): { widths: number[]; box: MaskBox } | null {
  const { box, rows } = maskRows(mask);

  if (box.x1 < 0) return null;

  return { widths: rowBandWidths(rows, box, bands), box };
}

export function maskProfileOf(mask: Mask, bands = 10): Profile | null {
  const measured = bandWidths(mask, bands);

  if (!measured) return null;

  const { widths, box } = measured;
  const H = box.y1 - box.y0 + 1;

  return { bands: widths.map((w) => round3(w / H)), aspect: round3((box.x1 - box.x0 + 1) / H) };
}

export function thresholdMask(values: Uint8Array, width: number, height: number, cut = 127): Mask {
  const data = new Uint8Array(width * height);

  for (let i = 0; i < data.length; i++) data[i] = values[i] > cut ? 1 : 0;

  return { data, width, height };
}

export interface BandVerdict {
  within: number;
  measured: number;
  narrow: Array<{ band: number; ratio: number }>;
  wide: Array<{ band: number; ratio: number }>;
}

export const BAND_TOLERANCE = 0.15;

export function bandVerdict(reference: Profile, model: Profile): BandVerdict {
  const verdict: BandVerdict = { within: 0, measured: 0, narrow: [], wide: [] };

  reference.bands.forEach((r, band) => {
    if (r <= 0.005) return;

    const ratio = round3((model.bands[band] ?? 0) / r);

    verdict.measured++;

    if (ratio < 1 - BAND_TOLERANCE) verdict.narrow.push({ band, ratio });
    else if (ratio > 1 + BAND_TOLERANCE) verdict.wide.push({ band, ratio });
    else verdict.within++;
  });

  return verdict;
}

export function bandMismatch(reference: Profile, model: Profile): number {
  let sum = 0,
    n = 0;

  reference.bands.forEach((r, band) => {
    if (r <= 0.005) return;

    sum += Math.abs(Math.log(Math.max(model.bands[band] ?? 0, 0.005) / r));
    n++;
  });

  return n ? sum / n + Math.abs(Math.log(Math.max(model.aspect, 0.01) / Math.max(reference.aspect, 0.01))) : Infinity;
}
