import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { readImportSource } from '../../datasets/import/readSource';
import { validateFrameSet } from '../frameSet';

const text = (value: string) => new TextEncoder().encode(value);
const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);

describe('YOLO detection ZIP import', () => {
  it('unpacks the YAML, detection labels and image through the import entry point', async () => {
    const zip = zipSync({
      'fruit/data.yaml': text('names: [apple]\ntrain: images/train\nval: images/val\n'),
      'fruit/images/train/apple.jpg': jpeg,
      'fruit/labels/train/apple.txt': text('0 0.5 0.5 0.5 0.5\n'),
    });
    const source = { kind: 'zip' as const, name: 'Fruit.zip', blob: new Blob([zip as Uint8Array<ArrayBuffer>]) };
    const imported = await readImportSource(source);

    expect(imported?.images?.classes).toEqual([{ id: 0, name: 'apple' }]);
    expect(imported?.images?.frames[0].split).toBe('train');
    expect(imported?.images?.frames[0].annotations[0].box).toEqual([1, 1, 2, 2]);
    validateFrameSet(imported?.images);

    const repeated = await readImportSource(source);

    expect(repeated?.images?.id).toBe(imported?.images?.id);
    expect(repeated?.hash).toBe(imported?.hash);
  });
});
