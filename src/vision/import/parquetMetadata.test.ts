import { parquetWriteBuffer } from 'hyparquet-writer';
import { describe, expect, it } from 'vitest';
import type { SourceFolder } from '../../datasets/import/types';
import { jsonBytes } from '../imageBytes';
import { readImageSource } from './readImageSource';
import { IMAGE_LIMITS } from './sourceFiles';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const info = (names: string[]) => ({ features: { objects: { feature: { category: { names } } } } });
const embedded = (names: string[]) => JSON.stringify({ info: info(names) });
const folder = (files: Record<string, Uint8Array>): SourceFolder => ({
  name: 'Fruit',
  files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
});
const parquet = (values: string[]) =>
  new Uint8Array(
    parquetWriteBuffer({
      columnData: [
        { name: 'image', type: 'BYTE_ARRAY', data: [jpeg] },
        { name: 'objects', type: 'JSON', data: [{ bbox: [[1, 1, 2, 2]], category: [0] }] },
      ],
      kvMetadata: values.map((value) => ({ key: 'huggingface', value })),
    }),
  );

describe('Hub parquet embedded class metadata', () => {
  it('reads ClassLabel names from the parquet footer', async () => {
    const source = folder({ 'data/train-00000-of-00001.parquet': parquet([embedded(['apple'])]) });
    const set = await readImageSource(source);

    expect(set?.classes).toEqual([{ id: 0, name: 'apple' }]);
    expect(set?.frames[0].annotations[0].classId).toBe(0);
    expect(set?.frames[0].split).toBe('train');
  });

  it('accepts matching embedded and external class metadata', async () => {
    const source = folder({
      'data/train.parquet': parquet([embedded(['apple'])]),
      'dataset_info.json': jsonBytes(info(['apple'])),
    });

    expect((await readImageSource(source))?.classes).toEqual([{ id: 0, name: 'apple' }]);
  });

  it('refuses conflicting embedded and external class metadata', async () => {
    const source = folder({
      'data/train.parquet': parquet([embedded(['apple'])]),
      'dataset_info.json': jsonBytes(info(['pear'])),
    });

    await expect(readImageSource(source)).rejects.toThrow('Check the image dataset format.');
  });

  it('refuses conflicting class metadata between parquet shards', async () => {
    const source = folder({
      'data/train-00000.parquet': parquet([embedded(['apple'])]),
      'data/train-00001.parquet': parquet([embedded(['pear'])]),
    });

    await expect(readImageSource(source)).rejects.toThrow('Check the image dataset format.');
  });

  it('refuses repeated conflicting Hugging Face footer entries', async () => {
    const source = folder({ 'data/train.parquet': parquet([embedded(['apple']), embedded(['pear'])]) });

    await expect(readImageSource(source)).rejects.toThrow('Check the image dataset format.');
  });

  it.each(['{', 'x'.repeat(IMAGE_LIMITS.metadata + 1)])(
    'refuses malformed or oversized footer metadata',
    async (value) => {
      await expect(readImageSource(folder({ 'data/train.parquet': parquet([value]) }))).rejects.toThrow();
    },
  );
});
