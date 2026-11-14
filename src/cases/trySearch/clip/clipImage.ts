export const IMAGE_SIZE = 256;

export interface ClipImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

function sampler(image: ClipImage) {
  const { width, height, data } = image;

  return (x: number, y: number, channel: number) => {
    const x0 = clamp(Math.floor(x), width - 1);
    const y0 = clamp(Math.floor(y), height - 1);
    const x1 = clamp(x0 + 1, width - 1);
    const y1 = clamp(y0 + 1, height - 1);
    const fx = clamp(x - x0, 1);
    const fy = clamp(y - y0, 1);
    const at = (px: number, py: number) => data[(py * width + px) * 4 + channel];
    const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
    const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;

    return top * (1 - fy) + bottom * fy;
  };
}

export function pixelValues(
  image: ClipImage,
  size = IMAGE_SIZE,
  out = new Float32Array(3 * size * size),
): Float32Array {
  const scale = Math.min(image.width, image.height) / size;
  const left = (image.width - size * scale) / 2;
  const top = (image.height - size * scale) / 2;
  const sample = sampler(image);
  const plane = size * size;

  for (let y = 0; y < size; y++) {
    const sy = top + (y + 0.5) * scale - 0.5;

    for (let x = 0; x < size; x++) {
      const sx = left + (x + 0.5) * scale - 0.5;
      const i = y * size + x;

      for (let c = 0; c < 3; c++) out[c * plane + i] = sample(sx, sy, c) / 255;
    }
  }

  return out;
}

export function unitVector(values: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(values);
  const norm = Math.hypot(...out) || 1;

  for (let i = 0; i < out.length; i++) out[i] /= norm;

  return out;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;

  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];

  return sum;
}
