import { describe, expect, it } from 'vitest';
import { MB } from '../../../electron/fileSize.mjs';
import { validateTrainingFrame } from '../frameSet';
import { readImageSource } from './readImageSource';
import { IMAGE_LIMITS, sourceBytes, sourceFiles } from './sourceFiles';

describe('shared image dataset byte units', () => {
  it('accepts a 64 MB image through source reading and frame validation', async () => {
    const bytes = new Uint8Array(64 * MB + 1);
    const jpeg = bytes.subarray(0, 64 * MB);

    jpeg.set([255, 216]);
    jpeg.set([255, 217], jpeg.length - 2);

    const files = sourceFiles({
      name: 'Images',
      files: [{ path: 'image.jpg', size: jpeg.length, read: async () => jpeg }],
    });

    expect(await sourceBytes(files, 'image.jpg', IMAGE_LIMITS.image)).toBe(jpeg);
    expect(() =>
      validateTrainingFrame(
        {
          id: 'image',
          seed: 0,
          camera: 'image',
          width: 1,
          height: 1,
          jpeg,
          annotations: [],
          depth: new Float32Array(1),
        },
        [],
      ),
    ).not.toThrow();
    expect(() =>
      validateTrainingFrame(
        {
          id: 'image',
          seed: 0,
          camera: 'image',
          width: 1,
          height: 1,
          jpeg: bytes,
          annotations: [],
          depth: new Float32Array(1),
        },
        [],
      ),
    ).toThrow();
  });

  it('reads metadata at 16 MB and refuses the next byte before reading', async () => {
    const bytes = new Uint8Array(16 * MB);
    const files = sourceFiles({
      name: 'Images',
      files: [{ path: 'metadata.json', size: bytes.length, read: async () => bytes }],
    });

    expect(await sourceBytes(files, 'metadata.json')).toBe(bytes);
    files.set('extra.json', {
      path: 'extra.json',
      size: bytes.length + 1,
      read: async () => {
        throw new Error('read oversized metadata');
      },
    });
    await expect(sourceBytes(files, 'extra.json')).rejects.toThrow(/size limit/);
  });

  it('accepts declared sources totaling 600 MB and refuses the next byte', () => {
    const files = ['one.parquet', 'two.parquet'].map((path) => ({
      path,
      size: 300 * MB,
      read: async () => new Uint8Array(),
    }));

    expect(sourceFiles({ name: 'Images', files }).size).toBe(2);
    files[1].size++;
    expect(() => sourceFiles({ name: 'Images', files })).toThrow();
  });

  it('allows a declared 256 MB Parquet file to reach the source reader', async () => {
    await expect(
      readImageSource({
        name: 'Images',
        files: [
          {
            path: 'data/train.parquet',
            size: 256 * MB,
            read: async () => {
              throw new Error('parquet source reached');
            },
          },
        ],
      }),
    ).rejects.toThrow('parquet source reached');
  });
});
