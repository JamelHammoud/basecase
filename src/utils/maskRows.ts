import type { Mask, MaskBox } from './silhouetteProfile';

export interface MaskRow {
  y: number;
  left: number;
  right: number;
}

export function maskRows({ data, width, height }: Mask): { box: MaskBox; rows: MaskRow[] } {
  const box = { x0: width, x1: -1, y0: height, y1: -1 };
  const rows: MaskRow[] = [];

  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;

    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue;

      if (left < 0) left = x;

      right = x + 1;
    }

    if (left < 0) continue;

    rows.push({ y, left, right });
    box.x0 = Math.min(box.x0, left);
    box.x1 = Math.max(box.x1, right - 1);
    box.y0 = Math.min(box.y0, y);
    box.y1 = y;
  }

  return { box, rows };
}

export function rowBandWidths(rows: MaskRow[], box: Pick<MaskBox, 'y0' | 'y1'>, bands = 10): number[] {
  const height = box.y1 - box.y0 + 1;
  const widths: number[] = [];
  let i = 0;

  for (let b = 0; b < bands; b++) {
    const from = box.y0 + Math.floor((b * height) / bands);
    const to = box.y0 + Math.floor(((b + 1) * height) / bands);
    let widest = 0;

    while (i < rows.length && rows[i].y < from) i++;

    while (i < rows.length && rows[i].y < to) {
      widest = Math.max(widest, rows[i].right - rows[i].left);
      i++;
    }

    widths.push(widest);
  }

  return widths;
}
