import { maskArea, maskProfileOf, type Mask, type Profile } from './silhouetteProfile';
import { distanceToEdge, type Grid } from './targetFit';

export interface Moments {
  cx: number;
  cy: number;
  area: number;
}

export interface Alignment {
  iou: number;
  roll: number;
  scale: number;
  dx: number;
  dy: number;
}

export function moments(mask: Mask): Moments {
  let sx = 0,
    sy = 0,
    n = 0;

  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;

    sx += i % mask.width;
    sy += Math.floor(i / mask.width);
    n++;
  }

  return { cx: n ? sx / n : 0, cy: n ? sy / n : 0, area: n };
}

export function rgbaMask(pixels: Uint8ClampedArray, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);

  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] > 127 ? 1 : 0;

  return { data, width, height };
}

export function shrinkMask(mask: Mask, maxSide: number): Mask {
  const k = Math.min(1, maxSide / Math.max(mask.width, mask.height));

  if (k === 1) return mask;

  const width = Math.max(1, Math.round(mask.width * k));
  const height = Math.max(1, Math.round(mask.height * k));
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[y * width + x] = mask.data[Math.floor((y + 0.5) / k) * mask.width + Math.floor((x + 0.5) / k)];

  return { data, width, height };
}

export function placeModel(photo: Mask, model: Mask, align: Omit<Alignment, 'iou'>): Uint8Array {
  const m = moments(model);
  const p = moments(photo);
  const cos = Math.cos((align.roll * Math.PI) / 180),
    sin = Math.sin((align.roll * Math.PI) / 180);
  const out = new Uint8Array(photo.width * photo.height);

  for (let y = 0; y < photo.height; y++)
    for (let x = 0; x < photo.width; x++) {
      const u = (x - p.cx - align.dx) / align.scale,
        v = (y - p.cy - align.dy) / align.scale;
      const mx = Math.round(m.cx + cos * u + sin * v),
        my = Math.round(m.cy - sin * u + cos * v);
      const inside = mx >= 0 && my >= 0 && mx < model.width && my < model.height;

      out[y * photo.width + x] = inside ? model.data[my * model.width + mx] : 0;
    }

  return out;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let both = 0,
    any = 0;

  for (let i = 0; i < a.length; i++) {
    both += a[i] & b[i];
    any += a[i] | b[i];
  }

  return any ? both / any : 0;
}

const SCALES = [0.96, 1, 1.04];

export function alignModel(photo: Mask, model: Mask, rolls: number[] = [0]): Alignment {
  const base = Math.sqrt(maskArea(photo) / Math.max(1, maskArea(model)));
  let best: Alignment = { iou: -1, roll: 0, scale: base, dx: 0, dy: 0 };

  for (const roll of rolls)
    for (const k of SCALES) {
      const candidate = { roll, scale: base * k, dx: 0, dy: 0 };
      const score = iou(photo.data, placeModel(photo, model, candidate));

      if (score > best.iou) best = { ...candidate, iou: score };
    }

  return best;
}

export interface FitDetail {
  iou: number;
  contourPx: number;
  photo: Profile | null;
  model: Profile | null;
  grid: Grid;
}

export function fitDetail(photo: Mask, model: Mask, align: Alignment): FitDetail {
  const placed = placeModel(photo, model, align);
  const toModel = distanceToEdge(placed, photo.width, photo.height);
  const toPhoto = distanceToEdge(photo.data, photo.width, photo.height);
  let sum = 0,
    n = 0;

  for (let i = 0; i < placed.length; i++) {
    if (toPhoto[i] === 0 && photo.data[i]) {
      sum += toModel[i];
      n++;
    }

    if (toModel[i] === 0 && placed[i]) {
      sum += toPhoto[i];
      n++;
    }
  }

  return {
    iou: iou(photo.data, placed),
    contourPx: n ? sum / n : 0,
    photo: maskProfileOf(photo),
    model: maskProfileOf({ data: placed, width: photo.width, height: photo.height }),
    grid: { width: photo.width, height: photo.height, cellMm: 1, target: photo.data, model: placed },
  };
}
