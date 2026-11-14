import { seeded } from '../utils/seeded';

export async function trainingJpeg(canvas: OffscreenCanvas, seed: number, noise = 0): Promise<Uint8Array> {
  if (!noise)
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());

  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = copy.getContext('2d', { willReadFrequently: true });

  if (!ctx) throw new Error('Couldn’t read the training image.');

  ctx.drawImage(canvas, 0, 0);

  const image = ctx.getImageData(0, 0, copy.width, copy.height);
  const random = seeded(seed ^ 0x14a03d);

  for (let pixel = 0; pixel < image.data.length; pixel += 4) {
    for (let channel = 0; channel < 3; channel++) image.data[pixel + channel] += (random() * 2 - 1) * noise * 255;
  }

  ctx.putImageData(image, 0, 0);

  return new Uint8Array(await (await copy.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());
}
