import { maskBounds, type Mask, type MaskBox } from './silhouetteProfile';

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function cropMask(mask: Mask, region?: Region): Mask {
  if (!region) return mask;

  const x0 = Math.floor(region.x0 * mask.width),
    x1 = Math.ceil(region.x1 * mask.width);
  const y0 = Math.floor(region.y0 * mask.height),
    y1 = Math.ceil(region.y1 * mask.height);
  const data = new Uint8Array(mask.data.length);

  for (let y = Math.max(0, y0); y < Math.min(mask.height, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(mask.width, x1); x++)
      data[y * mask.width + x] = mask.data[y * mask.width + x];

  return { ...mask, data };
}

interface Span {
  y: number;
  left: number;
  right: number;
}

function rowSpans(mask: Mask, box: MaskBox): Span[] {
  const spans: Span[] = [];

  for (let y = box.y0; y <= box.y1; y++) {
    let left = -1,
      right = -1;

    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask.data[y * mask.width + x]) continue;

      if (left < 0) left = x;

      right = x + 1;
    }

    if (left >= 0) spans.push({ y, left, right });
  }

  return spans;
}

type Point = [number, number];

function resample(points: Point[], n: number): Point[] {
  const lengths = [0];

  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1],
      b = points[i % points.length];

    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  const total = lengths[lengths.length - 1];
  const out: Point[] = [];
  let k = 0;

  for (let i = 0; i < n; i++) {
    const at = (i / n) * total;

    while (lengths[k + 1] < at) k++;

    const a = points[k],
      b = points[(k + 1) % points.length];
    const t = (at - lengths[k]) / Math.max(1e-9, lengths[k + 1] - lengths[k]);

    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }

  return out;
}

export interface Traced {
  points: Point[];
  widthMm: number;
  heightMm: number;
  bandsMm: number[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function traceOutline(mask: Mask, { mmPerPx, n = 20, z0 = 0 }: { mmPerPx: number; n?: number; z0?: number }) {
  const box = maskBounds(mask);

  if (box.x1 < 0) return null;

  const spans = rowSpans(mask, box);
  const cx = (box.x0 + box.x1 + 1) / 2;
  const toMm = (x: number, y: number): Point => [(x - cx) * mmPerPx, z0 + (box.y1 + 1 - y) * mmPerPx];
  const ring: Point[] = [
    ...spans.map((s) => toMm(s.right, s.y + 0.5)),
    toMm(spans[spans.length - 1].right, box.y1 + 1),
    toMm(spans[spans.length - 1].left, box.y1 + 1),
    ...[...spans].reverse().map((s) => toMm(s.left, s.y + 0.5)),
    toMm(spans[0].left, box.y0),
    toMm(spans[0].right, box.y0),
  ];
  const H = spans.length;
  const bandsMm = Array.from({ length: 10 }, (_, b) => {
    const rows = spans.slice(Math.floor((b * H) / 10), Math.floor(((b + 1) * H) / 10));

    return r1(Math.max(0, ...rows.map((s) => s.right - s.left)) * mmPerPx);
  });

  return {
    points: resample(ring, n).map(([x, z]) => [r1(x), r1(z)] as Point),
    widthMm: r1((box.x1 - box.x0 + 1) * mmPerPx),
    heightMm: r1((box.y1 - box.y0 + 1) * mmPerPx),
    bandsMm,
  };
}
