import { describe, expect, it } from 'vitest';
import type { FrameSet } from './frameSet';
import { exportCoco, importCoco } from './cocoExport';
import { exportYolo, importYolo } from './yoloExport';
import { imageSplit, IMAGE_SPLITS, splitFolder, type ImageSplit } from './imageSplit';

function fixture(count: number): FrameSet {
  const frames = Array.from({ length: count }, (_, i) => ({
    id: `frame-${count - i}`,
    seed: i,
    camera: 'import',
    width: 1,
    height: 1,
    jpeg: new Uint8Array([255, 216, i % 256, 255, 217]),
    depth: new Float32Array(1),
    annotations: [],
    split: 'test' as const,
  }));

  return {
    version: 1,
    id: 'frames-1',
    name: 'Images',
    caseId: null,
    sceneId: null,
    seed: 42,
    classes: [],
    createdAt: '2026-11-16',
    frames,
    splits: Object.fromEntries(frames.map((frame, i) => [frame.id, IMAGE_SPLITS[i % IMAGE_SPLITS.length]])),
  };
}

describe('saved image splits', () => {
  it.each([0, 1, 3, 300, 600])('partitions %i frames in source order with one assignment read per frame', (count) => {
    const set = fixture(count);
    const expected = Object.fromEntries(
      IMAGE_SPLITS.map((name) => [name, set.frames.filter((frame) => set.splits![frame.id] === name).map((f) => f.id)]),
    );
    let reads = 0;

    set.splits = new Proxy(set.splits!, {
      get(target, key: string) {
        reads++;

        return target[key];
      },
    });

    const before = structuredClone(set.frames);
    const result = imageSplit(set);

    expect(result).toEqual(expected);
    expect(reads).toBe(count);
    expect(set.frames).toEqual(before);
    result.train.push('local');
    expect(imageSplit(set)).toEqual(expected);
  });

  it('reads edited assignments afresh and leaves missing assignments out', () => {
    const set = fixture(3);

    set.splits = { 'frame-3': 'validation' };
    expect(imageSplit(set)).toEqual({ train: [], validation: ['frame-3'], test: [] });
    set.splits['frame-3'] = 'train';
    expect(imageSplit(set)).toEqual({ train: ['frame-3'], validation: [], test: [] });
  });

  it.each([
    { export: exportCoco, import: importCoco },
    { export: exportYolo, import: importYolo },
  ])('keeps saved assignments through package export and import', (format) => {
    const set = fixture(9);
    const files = format.export(set);

    for (const frame of set.frames) {
      const name: ImageSplit = set.splits![frame.id];

      expect(files[`images/${splitFolder(name)}/${frame.id}.jpg`]).toEqual(frame.jpeg);
    }

    expect(format.import(files)).toEqual(set);
  });
});
