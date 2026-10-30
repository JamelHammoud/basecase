import { maskArea, maskBounds, thresholdMask, type Mask, type MaskBox } from './silhouetteProfile';

export interface VisionMasks {
  width: number;
  height: number;
  instances: string[];
}

export const MAX_SUBJECT_SHARE = 0.6;

const MIN_SUBJECT_SHARE = 0.01;
const MAX_BORDER_SHARE = 0.5;
const CUT_EDGE_SHARE = 0.05;
const TRIM_SLACK = 1.3;
const THIN_COLUMN = 0.3;

function decodeBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

  return out;
}

export function decodeVisionMasks(found: VisionMasks): Mask[] {
  return found.instances.map((m) => thresholdMask(decodeBase64(m), found.width, found.height));
}

const boxArea = (b: MaskBox) => Math.max(0, b.x1 - b.x0 + 1) * Math.max(0, b.y1 - b.y0 + 1);

function overlapShare(a: MaskBox, b: MaskBox): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;

  return w > 0 && h > 0 ? (w * h) / Math.max(1, boxArea(b)) : 0;
}

function centrality(box: MaskBox, mask: Mask): number {
  const cx = (box.x0 + box.x1) / 2 / mask.width - 0.5;
  const cy = (box.y0 + box.y1) / 2 / mask.height - 0.5;

  return 1 - Math.min(0.5, Math.hypot(cx, cy));
}

export function pickSubject(instances: Mask[]): { mask: Mask; kept: number } | null {
  const scored = instances
    .map((mask) => ({ mask, box: maskBounds(mask), area: maskArea(mask) }))
    .filter((s) => s.area > 0)
    .map((s) => ({ ...s, score: s.area * centrality(s.box, s.mask) }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const [main] = scored;
  const parts = scored.filter((s) => s === main || overlapShare(main.box, s.box) > 0.5);
  const data = new Uint8Array(main.mask.data.length);

  for (const { mask } of parts) for (let i = 0; i < data.length; i++) data[i] |= mask.data[i];

  return { mask: { data, width: main.mask.width, height: main.mask.height }, kept: parts.length };
}

export interface EdgeContact {
  border: number;
  top: number;
  bottom: number;
}

export function edgeContact({ data, width: w, height: h }: Mask): EdgeContact {
  let top = 0,
    bottom = 0,
    sides = 0;

  for (let x = 0; x < w; x++) {
    top += data[x];
    bottom += data[(h - 1) * w + x];
  }

  for (let y = 0; y < h; y++) sides += data[y * w] + data[y * w + w - 1];

  return { border: (top + bottom + sides) / (2 * (w + h)), top: top / w, bottom: bottom / w };
}

export interface MaskCheck {
  share: number;
  refused?: string;
  cut?: 'top' | 'bottom' | 'top and bottom';
}

function cutEdges(contact: EdgeContact): MaskCheck['cut'] {
  const top = contact.top > CUT_EDGE_SHARE;
  const bottom = contact.bottom > CUT_EDGE_SHARE;

  if (top && bottom) return 'top and bottom';

  if (top) return 'top';

  return bottom ? 'bottom' : undefined;
}

export function checkMask(mask: Mask): MaskCheck {
  const share = maskArea(mask) / (mask.width * mask.height);
  const contact = edgeContact(mask);
  const percent = Math.round(share * 100);

  if (share > MAX_SUBJECT_SHARE) {
    return { share, refused: `the mask covers ${percent}% of the photo, so it has taken in background` };
  }

  if (share < MIN_SUBJECT_SHARE) return { share, refused: 'the subject is too small in the photo to measure' };

  if (contact.border > MAX_BORDER_SHARE) {
    return { share, refused: `the mask touches ${Math.round(contact.border * 100)}% of the photo's edge` };
  }

  return { share, cut: cutEdges(contact) };
}

function columnHeights(mask: Mask, box: MaskBox): number[] {
  const heights: number[] = [];

  for (let x = box.x0; x <= box.x1; x++) {
    let n = 0;

    for (let y = box.y0; y <= box.y1; y++) n += mask.data[y * mask.width + x];

    heights.push(n);
  }

  return heights;
}

function massCentre(heights: number[]): number {
  const total = heights.reduce((s, v) => s + v, 0);

  return total ? heights.reduce((s, v, i) => s + v * i, 0) / total : heights.length / 2;
}

export function trimToModelWidth(mask: Mask, modelAspect: number): { mask: Mask; trimmed: number } {
  const box = maskBounds(mask);

  if (box.x1 < 0 || !Number.isFinite(modelAspect) || modelAspect <= 0) return { mask, trimmed: 0 };

  const H = box.y1 - box.y0 + 1;
  const half = (modelAspect * H * TRIM_SLACK) / 2;
  const heights = columnHeights(mask, box);
  const centre = massCentre(heights);
  const data = mask.data.slice();
  let removed = 0;

  heights.forEach((h, i) => {
    if (Math.abs(i - centre) <= half || h > THIN_COLUMN * H) return;

    for (let y = box.y0; y <= box.y1; y++) data[y * mask.width + box.x0 + i] = 0;

    removed += h;
  });

  const area = heights.reduce((s, v) => s + v, 0);

  return { mask: { ...mask, data }, trimmed: area ? removed / area : 0 };
}
