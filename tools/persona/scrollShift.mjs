import sharp from 'sharp';
import { devicePixelRatioOf } from './frame.mjs';

export const STRIP = Object.freeze({ halfWidth: 80, scale: 0.5, minOverlap: 0.3, band: 160 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function stripOf(png, { x, devicePixelRatio }) {
  const { width, height } = await sharp(png).metadata();
  const dpr = devicePixelRatioOf(width, devicePixelRatio);
  const left = clamp(Math.round((x - STRIP.halfWidth) * dpr), 0, width - 1);
  const stripWidth = Math.min(width - left, Math.round(2 * STRIP.halfWidth * dpr));
  const size = {
    width: Math.max(1, Math.round((stripWidth / dpr) * STRIP.scale)),
    height: Math.max(1, Math.round((height / dpr) * STRIP.scale)),
  };
  const data = await sharp(png)
    .extract({ left, top: 0, width: stripWidth, height })
    .greyscale()
    .resize(size.width, size.height, { fit: 'fill' })
    .raw()
    .toBuffer();

  return { data, ...size };
}

function rowDiff(a, b, shift) {
  const from = Math.max(0, shift);
  const to = Math.min(a.height, b.height + shift);
  let sum = 0;

  for (let r = from; r < to; r++) {
    const ra = r * a.width;
    const rb = (r - shift) * b.width;

    for (let c = 0; c < a.width; c++) sum += Math.abs(a.data[ra + c] - b.data[rb + c]);
  }

  return { overlap: to - from, mean: sum / Math.max(1, (to - from) * a.width) };
}

export function bestShift(a, b, maxShift) {
  let best = { shift: 0, mean: rowDiff(a, b, 0).mean };

  for (let s = -maxShift; s <= maxShift; s++) {
    const d = rowDiff(a, b, s);

    if (s !== 0 && d.overlap >= a.height * STRIP.minOverlap && d.mean < best.mean - 0.01)
      best = { shift: s, mean: d.mean };
  }

  return best.shift;
}

export async function scrolledBy({ before, after, x, maxPx, devicePixelRatio }) {
  const a = await stripOf(before, { x, devicePixelRatio });
  const b = await stripOf(after, { x, devicePixelRatio });

  return Math.round(bestShift(a, b, Math.ceil(maxPx * STRIP.scale)) / STRIP.scale);
}

export function addScroll(bands, { x, px }) {
  const band = bands.find((b) => Math.abs(b.x - x) <= STRIP.band);

  if (band) band.px += px;
  else bands.push({ x, px });
}

export const scrollAt = (bands, x) =>
  bands.filter((b) => Math.abs(b.x - x) <= STRIP.band).reduce((sum, b) => sum + b.px, 0);
