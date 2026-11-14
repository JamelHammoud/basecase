import { describe, expect, it } from 'vitest';
import { newDataset } from '../datasets/datasetFile';
import { frameSetHash, type FrameSet } from './frameSet';
import { imageDatasetFiles } from './imageDataset';
import { annotationFromInstances } from './imageMasks';

const fixture = (): FrameSet => ({
  version: 1,
  id: 'set-1',
  name: 'Blocks',
  caseId: null,
  sceneId: null,
  seed: 42,
  classes: [],
  createdAt: 'now',
  frames: [
    {
      id: 'f1',
      seed: 42,
      camera: 'camera',
      width: 1,
      height: 1,
      annotations: [],
      jpeg: new Uint8Array([255, 216, 255, 217]),
      depth: new Float32Array([12]),
    },
  ],
});
const datasetOf = async (set: FrameSet) =>
  newDataset({
    id: 'dataset-1',
    name: 'Blocks',
    task: '',
    members: [],
    imageMembers: [
      { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) },
    ],
    at: 'now',
  });

describe('image dataset delivery', () => {
  it('merges classes across sets and deduplicates frames after class remapping', async () => {
    const labeled = (id: string, name: string, classId: number) => {
      const set = fixture();
      const annotation = annotationFromInstances({
        instanceIds: new Uint32Array([1]),
        width: 1,
        height: 1,
        instance: 'object',
        instanceId: 1,
        classId,
      });

      if (!annotation) throw new Error('Missing fixture annotation');

      return {
        ...set,
        id,
        classes: [{ id: classId, name }],
        frames: [{ ...set.frames[0], annotations: [annotation] }],
      };
    };
    const sets = [labeled('set-1', 'Block', 4), labeled('set-2', 'Cup', 4), labeled('set-3', 'Block', 9)];
    const dataset = await datasetOf(sets[0]);

    dataset.imageMembers = await Promise.all(
      sets.map(async (set) => ({ frameSetId: set.id, frameIds: ['f1'], hash: await frameSetHash(set) })),
    );

    const files = await imageDatasetFiles(dataset, async (id) => sets.find((set) => set.id === id) ?? null);
    const metadata = JSON.parse(new TextDecoder().decode(files['coco/basecase/frames.json']));

    expect(metadata.classes).toEqual([
      { id: 0, name: 'Block' },
      { id: 1, name: 'Cup' },
    ]);
    expect(metadata.frames).toHaveLength(2);
    expect(
      metadata.frames.map((frame: { annotations: [{ classId: number }] }) => frame.annotations[0].classId),
    ).toEqual([0, 1]);
  });

  it('writes both training formats from the selected dataset members', async () => {
    const set = fixture();
    const files = await imageDatasetFiles(await datasetOf(set), async () => set);
    const names = Object.keys(files);

    expect(names).toContain('coco/annotations/instances_train.json');
    expect(names).toContain('yolo/data.yaml');
    expect(names.filter((name) => name.endsWith('.jpg'))).toHaveLength(2);
    expect(names.filter((name) => name.endsWith('.f32'))).toHaveLength(2);
  });

  it('keeps try export files alongside images for a mixed dataset', async () => {
    const set = fixture();
    const dataset = { ...(await datasetOf(set)), members: ['try-1'] };
    const data = new Uint8Array([1, 2, 3]);
    const files = await imageDatasetFiles(dataset, async () => set, {
      'data/chunk-000/file-000.parquet': data,
      'meta/info.json': new TextEncoder().encode('{"codebase_version":"v3.0"}'),
    });

    expect(files['data/chunk-000/file-000.parquet']).toEqual(data);
    expect(files).toHaveProperty('meta/info.json');
    expect(files).toHaveProperty('coco/basecase/frames.json');
    expect(files).toHaveProperty('yolo/data.yaml');
  });

  it('refuses missing frames and content changed since the dataset version', async () => {
    const set = fixture();
    const dataset = await datasetOf(set);

    await expect(imageDatasetFiles(dataset, async () => null)).rejects.toThrow('missing');
    await expect(
      imageDatasetFiles(
        { ...dataset, imageMembers: [{ ...dataset.imageMembers![0], frameIds: ['gone'] }] },
        async () => set,
      ),
    ).rejects.toThrow('missing');
    set.frames[0].depth[0] = 13;
    await expect(imageDatasetFiles(dataset, async () => set)).rejects.toThrow('changed');
  });
});
