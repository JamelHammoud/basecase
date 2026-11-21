import type { Mask } from './silhouetteProfile';
import { maskRows } from './maskRows';

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function cropMask(mask: Mask, region?: Region): Mask {
  if (!region) return mask;

  const x0 = Math.max(0, Math.floor(region.x0 * mask.width));
  const x1 = Math.min(mask.width, Math.ceil(region.x1 * mask.width));
  const y0 = Math.max(0, Math.floor(region.y0 * mask.height));
  const y1 = Math.min(mask.height, Math.ceil(region.y1 * mask.height));
  const data = new Uint8Array(mask.data.length);

  if (x0 >= x1 || Number.isNaN(x0) || Number.isNaN(x1)) return { ...mask, data };

  for (let y = y0; y < y1; y++) {
    const start = y * mask.width + x0;
    const end = Math.min(y * mask.width + x1, data.length);

    if (start >= end) continue;

    data.set(mask.data.subarray(start, end), start);
  }

  return { ...mask, data };
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

    out.push([r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)]);
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
  const { box, rows: spans } = maskRows(mask);

  if (box.x1 < 0) return null;

  const cx = (box.x0 + box.x1 + 1) / 2;
  const toMm = (x: number, y: number): Point => [(x - cx) * mmPerPx, z0 + (box.y1 + 1 - y) * mmPerPx];
  const ring: Point[] = [];

  for (const span of spans) ring.push(toMm(span.right, span.y + 0.5));

  ring.push(toMm(spans[spans.length - 1].right, box.y1 + 1), toMm(spans[spans.length - 1].left, box.y1 + 1));

  for (let i = spans.length - 1; i >= 0; i--) ring.push(toMm(spans[i].left, spans[i].y + 0.5));

  ring.push(toMm(spans[0].left, box.y0), toMm(spans[0].right, box.y0));

  const H = spans.length;
  const bandsMm = Array.from({ length: 10 }, (_, b) => {
    const end = Math.floor(((b + 1) * H) / 10);
    let widest = 0;

    for (let i = Math.floor((b * H) / 10); i < end; i++) {
      widest = Math.max(widest, spans[i].right - spans[i].left);
    }

    return r1(widest * mmPerPx);
  });

  return {
    points: resample(ring, n),
    widthMm: r1((box.x1 - box.x0 + 1) * mmPerPx),
    heightMm: r1((box.y1 - box.y0 + 1) * mmPerPx),
    bandsMm,
  };
}
