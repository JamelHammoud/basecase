import sharp from 'sharp';
import { vi } from 'vitest';

export async function generatedPhoto(seed = 1, format: 'png' | 'jpeg' = 'png', size = { width: 64, height: 48 }) {
  const bytes = await sharp({
    create: { ...size, channels: 3, background: { r: seed * 30, g: 140, b: 70 } },
  })
    [format]()
    .toBuffer();

  return new Blob([Uint8Array.from(bytes)], { type: `image/${format}` });
}

interface DecodedPhoto {
  width: number;
  height: number;
  bytes: Buffer;
}

class PhotoCanvas {
  private image?: DecodedPhoto;

  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: (image: DecodedPhoto) => {
        this.image = image;
      },
    };
  }

  async convertToBlob() {
    const bytes = await sharp(this.image!.bytes)
      .resize(this.width, this.height)
      .flatten({ background: '#fff' })
      .jpeg()
      .toBuffer();

    return new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' });
  }
}

export function installPhotoDecoder() {
  vi.stubGlobal('createImageBitmap', async (blob: Blob, options?: ImageBitmapOptions) => {
    const input = Buffer.from(await blob.arrayBuffer());
    const metadata = await sharp(input).metadata();
    const oriented = options?.imageOrientation !== 'none' && metadata.orientation;
    const bytes = oriented ? await sharp(input).autoOrient().png().toBuffer() : input;
    const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });

    return { bytes, width: info.width, height: info.height, close: () => undefined };
  });
  vi.stubGlobal('OffscreenCanvas', PhotoCanvas);
}
