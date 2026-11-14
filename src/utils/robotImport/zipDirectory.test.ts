import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { zipEntryNames } from './zipDirectory';

const blobOf = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);

describe('zipEntryNames', () => {
  it('lists every entry from the central directory, comment and all', async () => {
    const zip = zipSync(
      { 'so101/meta/info.json': new Uint8Array(4000), 'so101/data/é.parquet': new Uint8Array([1, 2, 3]) },
      { comment: 'made by a tool' },
    );

    expect(await zipEntryNames(blobOf(zip))).toEqual(['so101/meta/info.json', 'so101/data/é.parquet']);
  });

  it('finds nothing in a file that isn’t a zip', async () => {
    expect(await zipEntryNames(blobOf(new Uint8Array(100).fill(7)))).toEqual([]);
  });
});
