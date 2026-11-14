import { caseRandom } from '../cases/caseRandom';

export function lensNoise(bytes: Uint8ClampedArray, sigma: number, seed: number): void {
  if (!sigma) return;

  const random = caseRandom(seed);
  const scale = sigma * 255;
  let spare: number | null = null;
  const gaussian = () => {
    if (spare !== null) {
      const value = spare;

      spare = null;

      return value;
    }

    const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random())));
    const angle = random() * Math.PI * 2;

    spare = radius * Math.sin(angle);

    return radius * Math.cos(angle);
  };

  for (let i = 0; i < bytes.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) bytes[i + channel] += gaussian() * scale;
  }
}

export async function trainingJpeg(canvas: OffscreenCanvas, sigma: number, seed: number): Promise<Uint8Array> {
  if (!sigma)
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());

  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d', { willReadFrequently: true })!;

  context.drawImage(canvas, 0, 0);

  const image = context.getImageData(0, 0, copy.width, copy.height);

  lensNoise(image.data, sigma, seed);
  context.putImageData(image, 0, 0);

  return new Uint8Array(await (await copy.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());
}
