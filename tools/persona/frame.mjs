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
