import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDataset } from '../datasets/datasetFile';
import type { Dataset } from '../datasets/datasetFile';
import type { FrameSet } from '../vision/frameSet';
import { frameSetHash } from '../vision/frameSet';
import { saveLabelFrames } from './frameLabelStorage';

const mocks = vi.hoisted(() => ({ datasets: vi.fn(), save: vi.fn(async () => {}), frames: vi.fn(async () => {}) }));

vi.mock('../datasets/datasetStore', () => ({ loadDatasets: mocks.datasets, saveDataset: mocks.save }));
vi.mock('../vision/frameSetStore', async (original) => ({ ...(await original<object>()), saveFrameSet: mocks.frames }));

const set: FrameSet = {
  version: 1,
  id: 'frames',
  name: 'Robot frames',
  caseId: null,
  sceneId: 'scene',
  seed: 0,
  classes: [],
  frames: ['first', 'second'].map((id) => ({
    id,
    seed: 0,
    camera: 'front',
    width: 1,
    height: 1,
    jpeg: new Uint8Array([255, 216, 255, 217]),
    depth: new Float32Array(1),
    annotations: [],
  })),
  createdAt: '2026-11-15',
};

beforeEach(() => vi.clearAllMocks());

describe('saving frame labels', () => {
  it('updates the working member hash while retaining its selected frames and frozen versions', async () => {
    const dataset = newDataset({
      id: 'dataset',
      name: 'Robot frames',
      task: 'Label objects',
      members: [],
      at: set.createdAt,
    });
    const edited = { ...set, classes: [{ id: 0, name: 'Cup' }] };
    const saved: Dataset = {
      ...dataset,
      imageMembers: [{ frameSetId: set.id, frameIds: ['first'], hash: 'a'.repeat(64), classes: ['Old name'] }],
      versions: [
        {
          n: 1,
          hash: 'b'.repeat(64),
          at: set.createdAt,
          members: [],
          imageMembers: [{ frameSetId: set.id, frameIds: ['first'], hash: 'a'.repeat(64) }],
        },
      ],
    };

    mocks.datasets.mockResolvedValue([saved]);
    await saveLabelFrames(edited);

    expect(mocks.frames).toHaveBeenCalledWith(edited);
    expect(mocks.save).toHaveBeenCalledWith({
      ...saved,
      imageMembers: [{ frameSetId: set.id, frameIds: ['first'], hash: await frameSetHash(edited), classes: ['Cup'] }],
    });
  });

  it('creates a dataset when the extracted frames have no existing member reference', async () => {
    mocks.datasets.mockResolvedValue([]);

    const dataset = await saveLabelFrames(set);

    expect(dataset.name).toBe(set.name);
    expect(dataset.imageMembers).toEqual([
      { frameSetId: set.id, frameIds: ['first', 'second'], hash: await frameSetHash(set), classes: [] },
    ]);
    expect(mocks.save).toHaveBeenCalledWith(dataset);
  });
});
