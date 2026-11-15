import { describe, expect, it } from 'vitest';
import { frameHash, frameSetHash, validateFrameSet, type FrameSet } from './frameSet';
import { imagePackage, readImagePackage } from './imagePackage';
import { packImageSnapshots, unpackImageSnapshot } from './imageSnapshot';
import { assignSources } from '../datasets/snapshotSplits';
import { datasetContentHash } from '../datasets/contentHash';

function labelledTry(): FrameSet {
  return {
    version: 1,
    id: 'labelled-try',
    name: 'Handle',
    caseId: null,
    sceneId: null,
    seed: 1,
    createdAt: '2026-11-15',
    classes: [{ id: 1, name: 'Handle', keypoints: ['grasp'] }],
    frames: [
      {
        id: 'frame-1',
        seed: 0,
        camera: '/camera/image/compressed',
        width: 2,
        height: 2,
        jpeg: new Uint8Array([255, 216, 255, 217]),
        depth: new Float32Array(4),
        source: 'try',
        origin: { tryId: 'operate-1', frame: 30, seconds: 0.6 },
        annotations: [
          {
            instance: 'handle',
            classId: 1,
            box: [0, 0, 1, 1],
            mask: { size: [2, 2], counts: [0, 1, 3] },
            polygons: [[0, 0, 1, 0, 1, 1, 0, 1]],
            keypoints: [{ name: 'grasp', x: 0.5, y: 0.5, visible: true }],
            review: 'suggested',
            source: 'agent',
          },
        ],
      },
    ],
  };
}

describe('frame label metadata', () => {
  it('keeps all cameras and frames of one try in one frozen dataset split', async () => {
    const set = labelledTry();
    const second = structuredClone(set.frames[0]);

    second.id = 'frame-2';
    second.seed = 999;
    second.camera = 'wrist';
    second.origin!.frame = 31;
    second.origin!.seconds = 0.62;
    set.frames.push(second);

    const packed = await packImageSnapshots(set, {
      frameSetId: set.id,
      frameIds: set.frames.map((frame) => frame.id),
      hash: await frameSetHash(set),
    });
    const samples = packed.map(({ sample }) => sample);

    expect(new Set(samples.map((sample) => sample.source)).size).toBe(1);
    expect(
      new Set(
        assignSources(
          samples.map((sample) => ({ source: sample.source, content: sample.hash })),
          42,
        ),
      ).size,
    ).toBe(1);
    expect(
      (
        await unpackImageSnapshot(
          { ...samples[1], content: await datasetContentHash(packed[1].bytes) },
          packed[1].bytes,
        )
      ).frames[0],
    ).toEqual(second);
  });

  it('round-trips recorded frame origins and review state through image packages', async () => {
    const set = labelledTry();

    expect(() => validateFrameSet(set)).not.toThrow();
    expect(readImagePackage(imagePackage(set))).toEqual(set);
    expect(await frameSetHash(structuredClone(set))).toBe(await frameSetHash(set));
  });

  it('includes review, label source and try origin in canonical hashes', async () => {
    const set = labelledTry();
    const original = await frameSetHash(set);
    const edits: Array<(set: FrameSet) => void> = [
      (value) => {
        value.frames[0].annotations[0].review = 'accepted';
      },
      (value) => {
        value.frames[0].annotations[0].source = 'manual';
      },
      (value) => {
        value.frames[0].origin!.frame++;
      },
      (value) => {
        value.frames[0].origin!.seconds += 0.02;
      },
      (value) => {
        value.frames[0].origin!.tryId = 'operate-2';
      },
    ];

    for (const edit of edits) {
      const changed = structuredClone(set);

      edit(changed);
      expect(await frameSetHash(changed)).not.toBe(original);
    }

    const frame = set.frames[0];
    const without = {
      ...frame,
      source: undefined,
      origin: undefined,
      annotations: frame.annotations.map(({ review: _review, source: _source, ...annotation }) => annotation),
    };

    expect(await frameHash(without)).toBe(await frameHash(structuredClone(without)));
  });

  it.each([
    { tryId: '../secret', frame: 0, seconds: 0 },
    { tryId: 'try-1', frame: -1, seconds: 0 },
    { tryId: 'try-1', frame: 1.5, seconds: 0 },
    { tryId: 'try-1', frame: 1, seconds: NaN },
    { tryId: 'try-1', frame: 1, seconds: -1 },
  ])('refuses malformed origin before reading image bytes: %j', (origin) => {
    const set = labelledTry();

    expect(() => validateFrameSet({ ...set, frames: [{ ...set.frames[0], origin }] })).toThrow('format');
  });

  it.each([{ review: 'reviewed' }, { source: 'external' }, { review: null }])(
    'refuses malformed review metadata: %j',
    (metadata) => {
      const set = labelledTry();

      expect(() =>
        validateFrameSet({
          ...set,
          frames: [{ ...set.frames[0], annotations: [{ ...set.frames[0].annotations[0], ...metadata }] }],
        }),
      ).toThrow('format');
    },
  );
});
