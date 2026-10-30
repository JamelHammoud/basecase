import { checkMask, decodeVisionMasks, pickSubject, trimToModelWidth, type VisionMasks } from './photoMask';
import { maskProfileOf, type Mask, type Profile } from './silhouetteProfile';

export type { Profile } from './silhouetteProfile';

export async function imageData(dataUrl: string, maxSide = 900, background?: string): Promise<ImageData> {
  const img = new Image();

  img.src = dataUrl;
  await img.decode();

  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.drawImage(img, 0, 0, w, h);

  return ctx.getImageData(0, 0, w, h);
}

function borderPixels(w: number, h: number): number[] {
  const border: number[] = [];

  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);

  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);

  return border;
}

function floodBackground(border: number[], w: number, h: number, isSubject: (i: number) => boolean): Uint8Array {
  const bg = new Uint8Array(w * h);
  const stack = [...border];

  while (stack.length) {
    const i = stack.pop()!;

    if (bg[i] || isSubject(i)) continue;

    bg[i] = 1;

    const x = i % w;

    if (x > 0) stack.push(i - 1);

    if (x < w - 1) stack.push(i + 1);

    if (i >= w) stack.push(i - w);

    if (i < w * (h - 1)) stack.push(i + w);
  }

  return bg;
}

export function floodMaskOf({ data, width: w, height: h }: ImageData): { mask?: Mask; reason?: string } {
  const border = borderPixels(w, h);
  const med = [0, 1, 2].map((k) => border.map((i) => data[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = (i: number) => Math.hypot(data[i * 4] - med[0], data[i * 4 + 1] - med[1], data[i * 4 + 2] - med[2]);
  const spread = border.reduce((s, i) => s + dist(i), 0) / border.length;

  if (spread > 14) return { reason: 'the background is not plain (busy scene or gradient)' };

  const bg = floodBackground(border, w, h, (i) => dist(i) > 12);
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) mask[i] = bg[i] ? 0 : 1;

  return { mask: { data: mask, width: w, height: h } };
}

export interface ReferenceProfile {
  profile: Profile | null;
  plain: boolean;
  reason?: string;
  source: 'vision' | 'flood';
  notes: string[];
}

export interface ReferenceRequest {
  dataUrl: string;
  masks?: VisionMasks | null;
  modelAspect?: number;
  allowCut?: boolean;
}

async function subjectMask({ dataUrl, masks }: ReferenceRequest) {
  const picked = masks?.instances.length ? pickSubject(decodeVisionMasks(masks)) : null;

  if (picked) {
    const notes = picked.kept > 1 ? [`joined ${picked.kept} foreground masks`] : [];

    return { mask: picked.mask, source: 'vision' as const, notes };
  }

  const flood = floodMaskOf(await imageData(dataUrl));

  return { mask: flood.mask, reason: flood.reason, source: 'flood' as const, notes: [] as string[] };
}

const cutReason = (cut: string) =>
  `the photo cuts the subject off at the ${cut}, so heights can't be measured against the whole model; pass ids to compare just the parts it shows`;

export interface ReferenceMask {
  mask?: Mask;
  reason?: string;
  source: 'vision' | 'flood';
  notes: string[];
}

export async function referenceMask(request: ReferenceRequest): Promise<ReferenceMask> {
  const found = await subjectMask(request);
  const base = { source: found.source, notes: found.notes };

  if (!found.mask) return { ...base, reason: found.reason ?? 'no subject found' };

  const check = checkMask(found.mask);

  if (check.refused) return { ...base, reason: check.refused };

  if (check.cut && !request.allowCut) return { ...base, reason: cutReason(check.cut) };

  const notes = [...found.notes, ...(check.cut ? [`subject cut off at the ${check.cut}`] : [])];
  const { mask, trimmed } = trimToModelWidth(found.mask, request.modelAspect ?? 0);

  if (trimmed > 0.02) {
    notes.push(`left out ${Math.round(trimmed * 100)}% of the mask: thin slivers wider than the model`);
  }

  return { mask, source: found.source, notes };
}

export async function referenceProfile(request: ReferenceRequest): Promise<ReferenceProfile> {
  const { mask, reason, source, notes } = await referenceMask(request);

  if (!mask) return { profile: null, plain: false, reason, source, notes };

  return { profile: maskProfileOf(mask), plain: true, source, notes };
}

export async function maskProfile(dataUrl: string): Promise<Profile | null> {
  const { data, width: w, height: h } = await imageData(dataUrl);
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) mask[i] = data[i * 4] > 127 ? 1 : 0;

  return maskProfileOf({ data: mask, width: w, height: h });
}
