import { refuse } from '../validate';
import type { WorldMaterial } from '../worldImportTypes';

function jpegSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255) return refuse('World texture', 'has a broken JPEG marker');

    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);

    if (length < 2 || offset + 2 + length > bytes.length) return refuse('World texture', 'has truncated JPEG data');

    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8)
      return [view.getUint16(offset + 7), view.getUint16(offset + 5)];

    offset += 2 + length;
  }

  return refuse('World texture', 'needs JPEG dimensions');
}

function webpSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = new TextDecoder().decode(bytes.subarray(12, 16));

  if (kind === 'VP8X' && bytes.length >= 30)
    return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];

  if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a)
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];

  if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f)
    return [1 + (view.getUint32(21, true) & 0x3fff), 1 + ((view.getUint32(21, true) >> 14) & 0x3fff)];

  return refuse('World texture', 'needs WebP dimensions');
}

function imageDimensions(bytes: Uint8Array): { width: number; height: number; mimeType: string } {
  if (bytes.length < 24) return refuse('World texture', 'has truncated image data');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(12) === 0x49484452;

  if (png) return { width: view.getUint32(16), height: view.getUint32(20), mimeType: 'image/png' };

  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  const webp = view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250;

  if (!jpeg && !webp) return refuse('World texture', 'needs PNG, JPEG or WebP data');

  const [width, height] = jpeg ? jpegSize(bytes) : webpSize(bytes);

  return { width, height, mimeType: jpeg ? 'image/jpeg' : 'image/webp' };
}

export function worldImagePixels(bytes: Uint8Array): number {
  const { width, height } = imageDimensions(bytes);

  if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216)
    return refuse('World texture', 'exceeds 16 million pixels');

  return width * height;
}

export function readWorldImage(bytes: Uint8Array, flipY: boolean): NonNullable<WorldMaterial['image']> {
  const { mimeType } = imageDimensions(bytes);

  worldImagePixels(bytes);

  return { bytes, mimeType, flipY, wrapS: 'repeat', wrapT: 'repeat' };
}
