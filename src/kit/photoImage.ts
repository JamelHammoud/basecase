import { imageDimensions } from '../vision/import/imageDecode';

export const PHOTO_LIMITS = { image: 20 * 1024 * 1024, thumbnail: 256 * 1024, edge: 320 };
export const photoFormatError = () => new Error('Choose a PNG or JPEG photo up to 20 MB and 16 megapixels.');

export interface BuildPhotoImage {
  hash: string;
  thumbnailHash: string;
  original: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  bytes: number;
}

async function digest(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());

  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jpegSize(bytes: Uint8Array): [number, number] {
  let at = 2;

  while (at + 9 < bytes.length) {
    if (bytes[at++] !== 255) throw photoFormatError();

    const marker = bytes[at++];

    if (marker === 255) {
      at--;

      continue;
    }

    const length = bytes[at] * 256 + bytes[at + 1];

    if (length < 2 || at + length > bytes.length) throw photoFormatError();

    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
      return imageDimensions(bytes[at + 5] * 256 + bytes[at + 6], bytes[at + 3] * 256 + bytes[at + 4]);

    if (marker === 218 || marker === 217) throw photoFormatError();

    at += length;
  }

  throw photoFormatError();
}

export function photoHeader(bytes: Uint8Array) {
  if (bytes.length < 33 || bytes.length > PHOTO_LIMITS.image) throw photoFormatError();

  if (bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217)
    return { type: 'image/jpeg', size: jpegSize(bytes) };

  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw photoFormatError();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw photoFormatError();

  return { type: 'image/png', size: imageDimensions(view.getUint32(16), view.getUint32(20)) };
}

export async function prepareBuildPhoto(input: Blob): Promise<BuildPhotoImage> {
  if (!input.size || input.size > PHOTO_LIMITS.image) throw photoFormatError();

  try {
    const bytes = new Uint8Array(await input.arrayBuffer());
    const {
      type,
      size: [width, height],
    } = photoHeader(bytes);
    const original = new Blob([bytes], { type });
    const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });

    try {
      if (
        !(bitmap.width === width && bitmap.height === height) &&
        !(bitmap.width === height && bitmap.height === width)
      )
        throw photoFormatError();

      const ratio = Math.min(1, PHOTO_LIMITS.edge / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * ratio)),
        Math.max(1, Math.round(bitmap.height * ratio)),
      );
      const context = canvas.getContext('2d');

      if (!context) throw photoFormatError();

      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });

      if (thumbnail.size > PHOTO_LIMITS.thumbnail) throw photoFormatError();

      return {
        hash: await digest(original),
        thumbnailHash: await digest(thumbnail),
        original,
        thumbnail,
        width,
        height,
        bytes: original.size + thumbnail.size,
      };
    } finally {
      bitmap.close();
    }
  } catch {
    throw photoFormatError();
  }
}

export async function verifyBuildPhoto(image: BuildPhotoImage) {
  if (
    !image ||
    !(image.original instanceof Blob) ||
    !(image.thumbnail instanceof Blob) ||
    image.original.size > PHOTO_LIMITS.image ||
    image.thumbnail.size > PHOTO_LIMITS.thumbnail ||
    image.bytes !== image.original.size + image.thumbnail.size
  )
    throw photoFormatError();

  const {
    size: [width, height],
    type,
  } = photoHeader(new Uint8Array(await image.original.arrayBuffer()));

  if (
    image.original.type !== type ||
    image.thumbnail.type !== 'image/jpeg' ||
    image.width !== width ||
    image.height !== height ||
    (await digest(image.original)) !== image.hash ||
    (await digest(image.thumbnail)) !== image.thumbnailHash
  )
    throw photoFormatError();

  return image;
}
