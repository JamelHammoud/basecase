import { chargeImage, IMAGE_LIMITS, refuseImage, type ImageSourceFiles } from './sourceFiles';

export function imageDimensions(width: number, height: number): [number, number] {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > IMAGE_LIMITS.pixels
  )
    refuseImage();

  return [width, height];
}

function sofDimensions(bytes: Uint8Array, at: number, length: number): [number, number] {
  if (length < 8) return refuseImage();

  return imageDimensions(bytes[at + 5] * 256 + bytes[at + 6], bytes[at + 3] * 256 + bytes[at + 4]);
}

function jpegDimensions(bytes: Uint8Array): [number, number] {
  let at = 2;

  while (at + 4 < bytes.length) {
    if (bytes[at++] !== 255) refuseImage();

    const marker = bytes[at++];

    if (marker === 255) {
      at--;

      continue;
    }

    const length = bytes[at] * 256 + bytes[at + 1];

    if (length < 2 || at + length > bytes.length) refuseImage();

    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      return sofDimensions(bytes, at, length);
    }

    if (marker === 218 || marker === 217) refuseImage();

    at += length;
  }

  return refuseImage();
}

export async function decodeSourceImage(bytes: Uint8Array, files: ImageSourceFiles) {
  if (bytes.length < 16 || bytes.length > IMAGE_LIMITS.image) refuseImage();

  if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    const [width, height] = jpegDimensions(bytes);

    chargeImage(files, width, height);

    return { jpeg: bytes, width, height };
  }

  if (
    bytes.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  )
    refuseImage();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [width, height] = imageDimensions(view.getUint32(16), view.getUint32(20));

  chargeImage(files, width, height);

  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));

  try {
    if (bitmap.width !== width || bitmap.height !== height) refuseImage();

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d') ?? refuseImage();

    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0);

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });

    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}
