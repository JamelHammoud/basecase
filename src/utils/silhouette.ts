/**
 * Silhouette profiles for comparing a model with a straight-on reference photo: the photo is
 * segmented by flood-filling its (plain) background from the border, the model render is a
 * white-on-black mask. Both become the span width of each tenth of their height, as a fraction
 * of that height, so proportions can be compared without knowing the photo's scale.
 */

export interface Profile {
  /** Span width per band, top band first, as a fraction of the silhouette height */
  bands: number[];
  /** Silhouette width / height */
  aspect: number;
}

async function imageData(dataUrl: string, maxSide = 900): Promise<ImageData> {
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
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function profile(mask: Uint8Array, w: number, h: number, bands = 10): Profile | null {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const H = y1 - y0 + 1;
  const out: number[] = [];
  for (let b = 0; b < bands; b++) {
    let widest = 0;
    for (let y = y0 + Math.floor((b * H) / bands); y < y0 + Math.floor(((b + 1) * H) / bands); y++) {
      let l = -1, r = -1;
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) {
        if (l < 0) l = x;
        r = x;
      }
      if (l >= 0) widest = Math.max(widest, r - l + 1);
    }
    out.push(Math.round((widest / H) * 1000) / 1000);
  }
  return { bands: out, aspect: Math.round(((x1 - x0 + 1) / H) * 1000) / 1000 };
}

/** Foreground of a photo with a plain background; null when the background isn't plain */
export async function photoProfile(dataUrl: string): Promise<{ profile: Profile | null; plain: boolean; reason?: string }> {
  const { data, width: w, height: h } = await imageData(dataUrl);
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const med = [0, 1, 2].map((k) => border.map((i) => data[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = (i: number) => Math.hypot(data[i * 4] - med[0], data[i * 4 + 1] - med[1], data[i * 4 + 2] - med[2]);
  const spread = border.reduce((s, i) => s + dist(i), 0) / border.length;
  if (spread > 14) return { profile: null, plain: false, reason: 'the background is not plain (busy scene or gradient)' };
  const bg = new Uint8Array(w * h);
  const stack = [...border];
  while (stack.length) {
    const i = stack.pop()!;
    if (bg[i] || dist(i) > 12) continue;
    bg[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  const mask = new Uint8Array(w * h);
  let fg = 0;
  for (let i = 0; i < w * h; i++) if (!bg[i]) {
    mask[i] = 1;
    fg++;
  }
  const share = fg / (w * h);
  if (share < 0.02 || share > 0.85) return { profile: null, plain: false, reason: 'the subject could not be separated from the background' };
  return { profile: profile(mask, w, h), plain: true };
}

/** White-on-black model render → profile */
export async function maskProfile(dataUrl: string): Promise<Profile | null> {
  const { data, width: w, height: h } = await imageData(dataUrl);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = data[i * 4] > 127 ? 1 : 0;
  return profile(mask, w, h);
}
