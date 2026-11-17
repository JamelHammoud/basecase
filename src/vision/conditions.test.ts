import { describe, expect, it } from 'vitest';
import { frameHash, frameSetHash, validateFrameSet } from './frameSet';
import { metricSet } from './training/metricsFixtures';
import { exportCoco, importCoco } from './cocoExport';
import { exportYolo, importYolo } from './yoloExport';
import { packImageSnapshots, unpackImageSnapshot } from './imageSnapshot';
import { datasetContentHash } from '../datasets/contentHash';
import { manifestOf } from './frameSetStoreTypes';
import { frameStoreJobs } from './frameStoreJobs';
import { buildImageDataset } from './imageDatasetBuild';
import { newDataset } from '../datasets/datasetFile';
import { restoreImages } from '../datasets/snapshotImages';
import { imagePackage } from './imagePackage';

describe('declared image conditions', () => {
  it('preserves legacy identities when optional condition metadata is absent', async () => {
    const set = metricSet();
    const before = await frameSetHash(set);
    const image = await frameHash(set.frames[0]);

    set.conditions = undefined;
    set.frames[0].conditions = undefined;
    expect(await frameHash(set.frames[0])).toBe(image);
    expect(await frameSetHash(set)).toBe(before);
    set.conditions = ['night', 'glare', 'wet floor'];
    expect(await frameSetHash(set)).not.toBe(before);
    expect(await frameHash(set.frames[0])).toBe(image);
    set.frames[0].conditions = ['night', 'glare'];
    expect(await frameHash(set.frames[0])).not.toBe(image);
  });

  it.each([
    ['duplicate definitions', ['night', 'night'], ['night']],
    ['undeclared membership', ['day'], ['night']],
    ['duplicate membership', ['night'], ['night', 'night']],
    ['whitespace', [' night'], []],
    ['control characters', ['night\n'], []],
    ['long label', ['x'.repeat(65)], []],
    ['definition bound', Array.from({ length: 33 }, (_, i) => `c${i}`), []],
    ['membership bound', Array.from({ length: 9 }, (_, i) => `c${i}`), Array.from({ length: 9 }, (_, i) => `c${i}`)],
  ])('refuses %s before storing a manifest or packaging images', (_, definitions, labels) => {
    const set = metricSet();

    set.conditions = definitions;
    set.frames[0].conditions = labels;
    expect(() => validateFrameSet(set)).toThrow();
    expect(() => frameStoreJobs.header(manifestOf(set))).toThrow();
    expect(() => exportCoco(set)).toThrow();
  });

  it.each([
    ['COCO', exportCoco, importCoco],
    ['YOLO', exportYolo, importYolo],
  ] as const)('round trips overlapping and empty conditions through canonical %s packages', async (_, write, read) => {
    const set = metricSet();

    set.conditions = ['night', 'glare', 'empty'];
    set.frames[0].conditions = ['night', 'glare'];

    const reopened = read(write(set));

    expect(reopened).toEqual(set);
    expect(await frameSetHash(reopened)).toBe(await frameSetHash(set));
  });

  it('freezes exact metadata, rejects tampering and keeps imported source isolation across label edits', async () => {
    const set = metricSet();

    set.frames[0].origin = undefined;
    set.frames[0].source = 'import';

    const member = { frameSetId: set.id, frameIds: ['one'], hash: await frameSetHash(set) };
    const original = (await packImageSnapshots(set, member))[0];

    expect(original.sample).not.toHaveProperty('groups');

    set.conditions = ['night', 'glare', 'empty'];
    set.frames[0].conditions = ['night', 'glare'];
    member.hash = await frameSetHash(set);

    const packed = (await packImageSnapshots(set, member))[0];
    const sample = { ...packed.sample, content: await datasetContentHash(packed.bytes) };

    expect(sample.source).toBe(original.sample.source);
    expect(sample.groups).toEqual({
      camera: 'camera',
      declared: ['night', 'glare', 'empty'],
      labels: ['night', 'glare'],
    });
    set.frames[0].conditions = [];
    expect((await unpackImageSnapshot(sample, packed.bytes)).frames[0].conditions).toEqual(['night', 'glare']);
    await expect(
      unpackImageSnapshot({ ...sample, groups: { ...sample.groups!, labels: ['empty'] } }, packed.bytes),
    ).rejects.toThrow('changed');
    await expect(unpackImageSnapshot(sample, original.bytes)).rejects.toThrow('changed');
  });

  it('merges condition definitions across selected sets in the ordinary dataset export', async () => {
    const first = metricSet();
    const second = metricSet();

    first.conditions = ['night', 'empty'];
    first.frames[0].conditions = ['night'];
    second.id = 'wrist';
    second.conditions = ['glare'];
    second.frames[0].conditions = ['glare'];

    const sets = [first, second];
    const dataset = newDataset({ id: 'dataset', name: 'Images', task: '', members: [], at: 'now' });
    const content = new Map<string, Uint8Array>();
    const samples = [];

    dataset.imageMembers = [];

    for (const set of sets) {
      const member = { frameSetId: set.id, frameIds: ['one'], hash: await frameSetHash(set) };

      dataset.imageMembers.push(member);

      for (const packed of await packImageSnapshots(set, member)) {
        const hash = await datasetContentHash(packed.bytes);

        content.set(hash, packed.bytes);
        samples.push({ ...packed.sample, content: hash });
      }
    }

    const restored = await restoreImages(samples, async (hash) => content.get(hash) ?? null);
    const files = await buildImageDataset(dataset, restored, samples);
    const coco = importCoco(
      Object.fromEntries(
        Object.entries(files)
          .filter(([path]) => path.startsWith('coco/'))
          .map(([path, bytes]) => [path.slice(5), bytes]),
      ),
    );

    expect(coco.conditions).toEqual(['night', 'empty', 'glare']);
    expect(coco.frames.map((frame) => frame.conditions)).toEqual([['night'], ['glare']]);
    expect(restored.map((set) => set.frames[0].id)).toEqual(['one', 'one']);
  });
});

describe('frozen condition content bounds', () => {
  it('charges expanded snapshot content cumulatively before restoring another member', async () => {
    const set = metricSet();

    set.frames.push({ ...structuredClone(set.frames[0]), id: 'two' });

    const member = { frameSetId: set.id, frameIds: ['one', 'two'], hash: await frameSetHash(set) };
    const packed = await packImageSnapshots(set, member);
    const sizes = set.frames.map((frame) =>
      Object.values(imagePackage({ ...set, frames: [frame], splits: undefined })).reduce(
        (sum, bytes) => sum + bytes.byteLength,
        0,
      ),
    );
    const budget = { remaining: sizes[0] + sizes[1] - 1 };
    const first = { ...packed[0].sample, content: await datasetContentHash(packed[0].bytes) };
    const second = { ...packed[1].sample, content: await datasetContentHash(packed[1].bytes) };

    await unpackImageSnapshot(first, packed[0].bytes, budget);
    expect(budget.remaining).toBe(sizes[1] - 1);
    await expect(unpackImageSnapshot(second, packed[1].bytes, budget)).rejects.toThrow('size limit');
  });
});
