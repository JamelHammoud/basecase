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

export function maskBounds({ data, width: w, height: h }: Mask): MaskBox {
  let x0 = w,
    x1 = -1,
    y0 = h,
    y1 = -1;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue;

      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }

  return { x0, x1, y0, y1 };
}

export function maskArea(mask: Mask): number {
  let n = 0;

  for (const v of mask.data) n += v ? 1 : 0;

  return n;
}

function rowWidth(mask: Uint8Array, row: number, x0: number, x1: number): number {
  let l = -1,
    r = -1;

  for (let x = x0; x <= x1; x++) {
    if (!mask[row + x]) continue;

    if (l < 0) l = x;

    r = x;
  }

  return l >= 0 ? r - l + 1 : 0;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function bandWidths(mask: Mask, bands = 10): { widths: number[]; box: MaskBox } | null {
  const box = maskBounds(mask);

  if (box.x1 < 0) return null;

  const H = box.y1 - box.y0 + 1;
  const widths: number[] = [];

  for (let b = 0; b < bands; b++) {
    let widest = 0;

    for (let y = box.y0 + Math.floor((b * H) / bands); y < box.y0 + Math.floor(((b + 1) * H) / bands); y++)
      widest = Math.max(widest, rowWidth(mask.data, y * mask.width, box.x0, box.x1));

    widths.push(widest);
  }

  return { widths, box };
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
