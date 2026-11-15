import { describe, expect, it } from 'vitest';
import { frameHash, frameSetHash, validateFrameSet, type FrameSet } from './frameSet';
import { imageSplit } from './imageSplit';
import { linkFrameClasses, matchImageClasses } from './matchImageClasses';
import { classCount } from '../datasets/datasetView';
import { newDataset, readDataset } from '../datasets/datasetFile';

const fixture = (): FrameSet => ({
  version: 1,
  id: 'frames-1',
  name: 'Mugs',
  caseId: null,
  sceneId: null,
  seed: 0,
  classes: [],
  createdAt: 'now',
  frames: Array.from({ length: 3 }, (_, i) => ({
    id: `frame-${i}`,
    seed: 0,
    camera: 'import',
    width: 1,
    height: 1,
    jpeg: new Uint8Array([255, 216, i, 255, 217]),
    depth: new Float32Array(1),
    annotations: [],
  })),
});

describe('imported image metadata', () => {
  it('keeps source splits through hashing and export rather than randomizing them', async () => {
    const set = fixture();

    set.frames = set.frames.slice(0, 3).map((frame, i) => ({
      ...frame,
      split: (['test', 'train', 'validation'] as const)[i],
    }));
    expect(imageSplit(set)).toEqual({ train: ['frame-1'], validation: ['frame-2'], test: ['frame-0'] });

    const hash = await frameSetHash(set);
    const frame = await frameHash(set.frames[0]);

    set.frames[0].split = 'train';
    expect(await frameSetHash(set)).not.toBe(hash);
    expect(await frameHash(set.frames[0])).not.toBe(frame);
    expect(() => validateFrameSet({ ...set, frames: [{ ...set.frames[0], split: '../test' }] })).toThrow();
    expect(() => validateFrameSet({ ...set, frames: [{ ...set.frames[0], split: ['train'] }] })).toThrow();
  });

  it('links case and plural folded classes to unique world names', () => {
    const classes = [
      { id: 7, name: 'Mugs' },
      { id: 9, name: 'Boxes' },
      { id: 11, name: 'plate' },
    ];
    const objects = [
      { id: 'mug-1', name: 'mug' },
      { id: 'box-1', name: 'Box' },
    ];

    expect(matchImageClasses(classes, objects)).toEqual([
      { id: 7, name: 'mug', objectId: 'mug-1' },
      { id: 9, name: 'Box', objectId: 'box-1' },
      { id: 11, name: 'plate' },
    ]);
    expect(matchImageClasses(classes, [...objects, { id: 'mug-2', name: 'Mug' }])[0]).toEqual(classes[0]);
    expect(classes[0].name).toBe('Mugs');
    expect(matchImageClasses([{ id: 0, name: 'plate', objectId: 'other-scene' }], objects)).toEqual([
      { id: 0, name: 'plate' },
    ]);
  });

  it('persists bounded class names with image members and counts shared classes once', () => {
    const member = { frameSetId: 'frames-1', frameIds: ['frame-1'], hash: 'a'.repeat(64), classes: ['mug'] };
    const dataset = newDataset({
      id: 'dataset-1',
      name: 'Mugs',
      task: '',
      members: [],
      at: 'now',
      imageMembers: [member, { ...member, frameSetId: 'frames-2', classes: ['mug', 'Box'] }],
    });

    expect(readDataset(dataset)).toEqual(dataset);
    expect(classCount(dataset)).toBe(2);
    expect(classCount({ imageMembers: [{ frameSetId: 'old', frameIds: ['frame-1'], hash: member.hash }] })).toBeNull();
    expect(readDataset({ ...dataset, imageMembers: [{ ...member, classes: ['x'.repeat(201)] }] })).toBeNull();
    expect(readDataset({ ...dataset, imageMembers: [{ ...member, classes: [1] }] })).toBeNull();
  });

  it('merges aliases that link to the same world object without duplicate categories', () => {
    const set = {
      ...fixture(),
      classes: [
        { id: 7, name: 'Mugs' },
        { id: 9, name: 'mug' },
      ],
    };
    const linked = linkFrameClasses(set, [{ id: 'mug-1', name: 'mug' }]);

    expect(linked.classes).toEqual([{ id: 7, name: 'mug', objectId: 'mug-1' }]);
    expect(() => validateFrameSet(linked)).not.toThrow();
    expect(set.classes).toHaveLength(2);
  });
});
