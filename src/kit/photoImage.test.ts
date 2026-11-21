import sharp from 'sharp';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { generatedPhoto, installPhotoDecoder } from './photoImage.fixtures';
import { photoHeader, prepareBuildPhoto, verifyBuildPhoto, PHOTO_LIMITS } from './photoImage';

beforeEach(installPhotoDecoder);
afterEach(() => vi.unstubAllGlobals());

it.each(['png', 'jpeg'] as const)(
  'fully decodes generated %s bytes regardless of MIME or original filename',
  async (format) => {
    const input = await generatedPhoto(1, format);
    const photo = await prepareBuildPhoto(new Blob([input], { type: 'text/html' }));

    expect(photo.width).toBe(64);
    expect(photo.height).toBe(48);
    expect(photo.bytes).toBe(photo.original.size + photo.thumbnail.size);
    expect(photo.thumbnail.type).toBe('image/jpeg');
    await expect(verifyBuildPhoto(photo)).resolves.toEqual(photo);
  },
);

it('refuses damaged, truncated, unsupported and oversized input before publishing content', async () => {
  const input = await generatedPhoto();
  const bytes = new Uint8Array(await input.arrayBuffer());
  const damaged = bytes.slice();

  damaged.fill(0, 40, 60);
  await expect(prepareBuildPhoto(new Blob([damaged]))).rejects.toThrow();
  await expect(prepareBuildPhoto(new Blob([bytes.slice(0, 35)]))).rejects.toThrow();
  await expect(prepareBuildPhoto(new Blob(['<svg></svg>']))).rejects.toThrow();
  await expect(prepareBuildPhoto(new Blob([new Uint8Array(PHOTO_LIMITS.image + 1)]))).rejects.toThrow();
});

it('checks pixel and edge limits from headers before invoking a decoder', async () => {
  const bytes = new Uint8Array(await (await generatedPhoto()).arrayBuffer());
  const decode = vi.fn();

  vi.stubGlobal('createImageBitmap', decode);

  for (const [width, height] of [
    [8193, 1],
    [8192, 8192],
    [0, 480],
    [4096, 4097],
  ]) {
    const bad = bytes.slice();
    const view = new DataView(bad.buffer);

    view.setUint32(16, width);
    view.setUint32(20, height);
    await expect(prepareBuildPhoto(new Blob([bad]))).rejects.toThrow();
  }

  expect(decode).not.toHaveBeenCalled();
  expect(photoHeader(bytes).size).toEqual([64, 48]);
});

it('independently refuses stored original and thumbnail corruption and dimensions', async () => {
  const photo = await prepareBuildPhoto(await generatedPhoto());

  await expect(verifyBuildPhoto({ ...photo, hash: 'a'.repeat(64) })).rejects.toThrow();
  await expect(
    verifyBuildPhoto({ ...photo, thumbnail: new Blob(['changed'], { type: 'image/jpeg' }) }),
  ).rejects.toThrow();
  await expect(verifyBuildPhoto({ ...photo, width: 65 })).rejects.toThrow();
});

it.each([2, 3, 6, 8])(
  'keeps JPEG EXIF orientation %s in the thumbnail without changing original bytes',
  async (orientation) => {
    const corner = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#22cc44' } })
      .png()
      .toBuffer();
    const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#cc2211' } })
      .composite([{ input: corner, left: 0, top: 0 }])
      .withMetadata({ orientation })
      .jpeg()
      .toBuffer();
    const photo = await prepareBuildPhoto(new Blob([Uint8Array.from(bytes)]));
    const expected = await sharp(bytes).autoOrient().raw().toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(Buffer.from(await photo.thumbnail.arrayBuffer()))
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(thumbnail.info.width).toBe(expected.info.width);
    expect(thumbnail.info.height).toBe(expected.info.height);

    for (const [x, y] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      const at = (Math.floor(expected.info.height * y) * expected.info.width + Math.floor(expected.info.width * x)) * 3;

      expect(thumbnail.data[at + 1] > thumbnail.data[at]).toBe(expected.data[at + 1] > expected.data[at]);
    }

    expect(Buffer.from(await photo.original.arrayBuffer())).toEqual(bytes);
    await verifyBuildPhoto(photo);
  },
);

it('accepts the exact pixel and byte limits and bounds the decoded thumbnail', async () => {
  const raster = await generatedPhoto(1, 'png', { width: 4096, height: 4096 });
  const input = new Blob([raster, new Uint8Array(PHOTO_LIMITS.image - raster.size)]);
  const photo = await prepareBuildPhoto(input);
  const thumbnail = await sharp(Buffer.from(await photo.thumbnail.arrayBuffer())).metadata();

  expect(photo.original.size).toBe(PHOTO_LIMITS.image);
  expect(photo.width * photo.height).toBe(16777216);
  expect(thumbnail.width).toBe(320);
  expect(thumbnail.height).toBe(320);
  expect(photo.thumbnail.size).toBeLessThanOrEqual(PHOTO_LIMITS.thumbnail);
  await verifyBuildPhoto(photo);
});
