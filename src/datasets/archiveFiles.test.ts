import { describe, expect, it } from 'vitest';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { datasetArchiveFiles } from './archiveFiles';

const bytes = new Uint8Array([1, 2, 3]);

function changedEntrySize(originalSize: number) {
  const archive = zipSync({ 'dataset/data.bin': bytes }, { level: 0 });
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);

  for (let offset = 0; offset < archive.length - 28; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 24, originalSize, true);
  }

  return archive;
}

describe('saved dataset archives', () => {
  it('reads both stored and compressed files under their dataset root', () => {
    for (const level of [0, 6] as const) {
      const archive = zipSync({ 'dataset/data.bin': bytes, 'dataset/meta/info.json': bytes }, { level });

      expect(datasetArchiveFiles(archive)).toEqual({ 'data.bin': bytes, 'meta/info.json': bytes });
    }
  });

  it('refuses stored entries whose expanded size understates bytes copied by the ZIP reader', () => {
    expect(() => datasetArchiveFiles(changedEntrySize(0))).toThrow('damaged');
  });

  it('refuses unsafe paths and more than one dataset root', () => {
    const archives: Array<Record<string, Uint8Array>> = [
      { 'dataset/../auth': bytes },
      { 'dataset/file': bytes, 'other/file': bytes },
      { file: bytes },
    ];

    for (const files of archives) {
      expect(() => datasetArchiveFiles(zipSync(files))).toThrow('damaged');
    }
  });
});
