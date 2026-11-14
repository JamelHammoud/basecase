import sharp from 'sharp';

export const FRAME = Object.freeze({ cssWidthGuess: 1480, maxEdge: 1568 });

export function devicePixelRatioOf(imageWidth, override) {
  const given = Number(override);

  if (given > 0) return given;

  return Math.max(1, Math.round((imageWidth / FRAME.cssWidthGuess) * 4) / 4);
}

export async function frameOf(png, devicePixelRatio) {
  const { width, height } = await sharp(png).metadata();
  const dpr = devicePixelRatioOf(width, devicePixelRatio);
  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  const fit = Math.min(1, FRAME.maxEdge / Math.max(cssWidth, cssHeight));
  const outWidth = Math.round(cssWidth * fit);
  const outHeight = Math.round(cssHeight * fit);
  const data = await sharp(png).resize(outWidth, outHeight, { fit: 'fill' }).png().toBuffer();

  return { data: data.toString('base64'), width: outWidth, height: outHeight, toCss: cssWidth / outWidth };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function closeUpOf(png, box, devicePixelRatio) {
  const { width, height } = await sharp(png).metadata();
  const dpr = devicePixelRatioOf(width, devicePixelRatio);
  const left = clamp(Math.round(box.x * dpr), 0, width - 1);
  const top = clamp(Math.round(box.y * dpr), 0, height - 1);
  const w = clamp(Math.round(box.width * dpr), 1, width - left);
  const h = clamp(Math.round(box.height * dpr), 1, height - top);
  const fit = Math.min(1, FRAME.maxEdge / Math.max(w, h));
  const data = await sharp(png)
    .extract({ left, top, width: w, height: h })
    .resize(Math.round(w * fit), Math.round(h * fit), { fit: 'fill' })
    .png()
    .toBuffer();

  return { data: data.toString('base64'), scale: (fit * dpr).toFixed(2) };
}
