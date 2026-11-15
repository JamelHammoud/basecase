import { describe, expect, it } from 'vitest';
import { newDataset } from './datasetFile';
import { freezeImages, frozenImageJpeg, restoreImages } from './snapshotImages';
import { frameSetHash, type FrameSet } from '../vision/frameSet';
import { buildImageDataset } from '../vision/imageDatasetBuild';
import { importCoco } from '../vision/cocoExport';
import { importYolo } from '../vision/yoloExport';
import { annotationFromInstances } from '../vision/imageMasks';
import { datasetContentHash } from './contentHash';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { unpackImageSnapshot } from '../vision/imageSnapshot';

const blockAnnotation = () => {
  const annotation = annotationFromInstances({
    instanceIds: new Uint32Array([1]),
    width: 1,
    height: 1,
    instance: 'block',
    instanceId: 1,
    classId: 4,
  });

  if (!annotation) throw new Error('Missing fixture annotation');

  return annotation;
};

const fixture = (): FrameSet => ({
  version: 1,
  id: 'images',
  name: 'Blocks',
  caseId: 'case',
  sceneId: 'scene',
  seed: 42,
  classes: [{ id: 4, name: 'Block' }],
  createdAt: 'now',
  frames: ['left', 'right'].map((camera) => ({
    id: camera,
    seed: 7,
    camera,
    width: 1,
    height: 1,
    annotations: [blockAnnotation()],
    jpeg: new Uint8Array([255, 216, 255, 217]),
    depth: new Float32Array([12]),
  })),
});

async function frozenFixture(set = fixture()) {
  const member = { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) };
  const blobs = new Map<string, Uint8Array>();
  const save = async (bytes: Uint8Array) => {
    const hash = await datasetContentHash(bytes);

    blobs.set(hash, bytes.slice());

    return hash;
  };
  const samples = await freezeImages([member], async () => set, save);

  return { set, member, blobs, samples, save };
}

describe('frozen image samples', () => {
  it('reuses the exact packed content when the source stays unchanged', async () => {
    const { set, member, blobs, samples, save } = await frozenFixture();
    const repeated = await freezeImages([member], async () => set, save);

    expect(repeated).toEqual(samples);
    expect(blobs.size).toBe(2);
    expect(samples.every((sample) => !('explicit' in sample))).toBe(true);
  });

  it('keeps explicit image assignments separate from generated split defaults', async () => {
    const { set, member, save } = await frozenFixture();

    set.splits = { left: 'validation', right: 'test' };

    const samples = await freezeImages([member], async () => set, save);

    expect(samples.map(({ frameId, split, explicit }) => ({ frameId, split, explicit }))).toEqual([
      { frameId: 'left', split: 'validation', explicit: 'validation' },
      { frameId: 'right', split: 'test', explicit: 'test' },
    ]);
  });

  it('keeps exact images, depth and annotations after source edits or removal', async () => {
    const { set, blobs, samples } = await frozenFixture();

    expect(samples.map((sample) => sample.source)).toEqual(['["run","scene","case",7]', '["run","scene","case",7]']);
    set.frames[0].jpeg[0] = 0;
    set.frames[0].depth[0] = 99;
    set.frames[0].annotations[0].instance = 'changed';
    set.classes[0].name = 'Changed';
    set.frames = [];

    const restored = await restoreImages(samples, async (hash) => blobs.get(hash) ?? null);

    expect(restored).toHaveLength(1);
    expect(restored[0].frames.map((frame) => frame.id)).toEqual(['left', 'right']);
    expect(restored[0].frames[0].jpeg).toEqual(new Uint8Array([255, 216, 255, 217]));
    expect(restored[0].frames[0].depth).toEqual(new Float32Array([12]));
    expect(restored[0].classes).toEqual([{ id: 4, name: 'Block' }]);
    expect(restored[0].frames[0].annotations).toEqual([blockAnnotation()]);
    expect(await frozenImageJpeg(samples[0], async (hash) => blobs.get(hash) ?? null)).toEqual(
      new Uint8Array([255, 216, 255, 217]),
    );
  });

  it('restores and exports hundreds of images with bounded frame lookup work', async () => {
    const set = fixture();
    const count = 200;

    set.frames = Array.from({ length: count }, (_, i) => ({ ...set.frames[i % 2], id: `frame-${i}`, seed: i }));

    const { samples, blobs } = await frozenFixture(set);
    const assigned = samples.map((sample, i) => ({ ...sample, split: i % 2 ? ('test' as const) : ('train' as const) }));
    const restored = await restoreImages(assigned, async (hash) => blobs.get(hash) ?? null);
    let reads = 0;

    for (const frame of restored[0].frames) {
      const id = frame.id;

      Object.defineProperty(frame, 'id', {
        enumerable: true,
        get: () => {
          reads++;

          return id;
        },
      });
    }

    const dataset = newDataset({ id: 'dataset', name: 'Blocks', task: '', members: [], at: 'now' });
    const files = await buildImageDataset(dataset, restored, assigned);
    const metadata = JSON.parse(new TextDecoder().decode(files['coco/basecase/frames.json']));

    expect(metadata.frames.map((frame: { seed: number }) => frame.seed)).toEqual(
      Array.from({ length: count }, (_, i) => i),
    );
    expect(Object.values(metadata.splits).filter((split) => split === 'test')).toHaveLength(count / 2);
    expect(Object.keys(files).filter((path) => path.endsWith('.jpg'))).toHaveLength(count * 2);
    expect(reads).toBeLessThanOrEqual(count * 3);
  });

  it('reports missing and changed frozen image content', async () => {
    const { blobs, samples } = await frozenFixture();

    await expect(restoreImages(samples, async () => null)).rejects.toThrow('missing');
    await expect(
      restoreImages([{ ...samples[0], hash: 'f'.repeat(64) }], async (hash) => blobs.get(hash) ?? null),
    ).rejects.toThrow('changed');
    await expect(
      restoreImages([{ ...samples[0], frameId: 'gone' }], async (hash) => blobs.get(hash) ?? null),
    ).rejects.toThrow('changed');
  });

  it('exports the frozen split in both formats after dataset references change', async () => {
    const { member, blobs, samples } = await frozenFixture();
    const assigned = samples.map((sample) => ({ ...sample, split: 'test' as const }));
    const sets = await restoreImages(assigned, async (hash) => blobs.get(hash) ?? null);
    const dataset = newDataset({ id: 'dataset', name: 'Blocks', task: '', members: [], at: 'now' });

    dataset.imageMembers = [{ ...member, frameIds: ['gone'] }];

    const files = await buildImageDataset(dataset, sets, assigned);
    const format = (name: string) =>
      Object.fromEntries(
        Object.entries(files)
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, bytes]) => [path.slice(name.length + 1), bytes]),
      );
    const coco = importCoco(format('coco'));
    const yolo = importYolo(format('yolo'));

    expect(coco.frames).toHaveLength(2);
    expect(coco).toEqual(yolo);
    expect(Object.values(coco.splits ?? {})).toEqual(['test', 'test']);
    expect(Object.keys(files).filter((path) => path.endsWith('.jpg'))).toHaveLength(4);
    expect(Object.keys(files).filter((path) => path.includes('/images/test/'))).toHaveLength(4);
  });

  it('refuses source changes before creating a frozen sample', async () => {
    const set = fixture();
    const member = { frameSetId: set.id, frameIds: ['left'], hash: await frameSetHash(set) };

    set.frames[0].depth[0] = 99;

    await expect(
      freezeImages(
        [member],
        async () => set,
        async () => '0'.repeat(64),
      ),
    ).rejects.toThrow('changed');
  });

  it('rejects oversized ZIP declarations before allocating the expanded frame', async () => {
    const { samples } = await frozenFixture();
    const bytes = zipSync({ large: new Uint8Array(0) });
    const directory = bytes.findIndex(
      (byte, i) => byte === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2,
    );

    expect(directory).toBeGreaterThan(0);
    new DataView(bytes.buffer).setUint32(directory + 24, 192_000_001, true);
    await expect(unpackImageSnapshot(samples[0], bytes)).rejects.toThrow('size limit');
  });
});
