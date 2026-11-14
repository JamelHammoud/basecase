import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDataset } from '../datasets/datasetFile';
import type { PreparedDataset } from './datasetJob';

const state = vi.hoisted(() => ({
  zip: vi.fn(),
  files: vi.fn(),
  tries: vi.fn(),
  download: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('../vision/imageDataset', () => ({ imageDatasetZip: state.zip, imageDatasetFiles: state.files }));
vi.mock('../datasets/datasetClient', () => ({ exportDatasetFiles: state.tries }));
vi.mock('../utils/downloadBytes', () => ({ downloadBytes: state.download }));
vi.mock('../hub/hubBridge', () => ({ hubBridge: { publish: state.publish } }));

import { deliverImageDataset, imageDatasetDownload } from './deliverImageDataset';

const dataset = newDataset({
  id: 'mixed',
  name: 'Blocks',
  members: ['try'],
  imageMembers: [{ frameSetId: 'frames', frameIds: ['frame'], hash: 'a'.repeat(64) }],
  task: 'Pick a block',
  at: 'now',
});
const records = { of: vi.fn(), freeze: vi.fn() };
const prepared = { used: 2, left: 1, modelHash: 'robot', job: {} } as PreparedDataset;

beforeEach(() => {
  vi.clearAllMocks();
  state.zip.mockResolvedValue(new Uint8Array([1]));
  state.files.mockResolvedValue({ 'coco/basecase/frames.json': new Uint8Array([2]) });
  state.tries.mockResolvedValue({ 'meta/info.json': new Uint8Array([3]) });
  state.publish.mockResolvedValue({ repo: 'user/blocks', url: 'https://huggingface.co/datasets/user/blocks' });
  records.freeze.mockResolvedValue({ n: 3 });
});

describe('image dataset delivery', () => {
  it('includes fitting tries in downloads and reports the excluded tries', async () => {
    const result = await deliverImageDataset(dataset, records, false, prepared);

    expect(state.zip).toHaveBeenCalledWith(dataset, { 'meta/info.json': new Uint8Array([3]) });
    expect(records.freeze).toHaveBeenCalledWith(dataset, 'robot');
    expect(state.download).toHaveBeenCalledWith(new Uint8Array([1]), 'blocks-dataset.zip', 'application/zip');
    expect(result.message).toBe('Exported 1 image and 2 tries, left out 1 from another Case or design');
  });

  it('publishes mixed files with the frozen dataset tag and reports the excluded tries', async () => {
    const result = await deliverImageDataset(dataset, records, true, prepared);

    expect(state.files).toHaveBeenCalledWith(dataset, undefined, { 'meta/info.json': new Uint8Array([3]) });
    expect(state.publish).toHaveBeenCalledWith({
      name: expect.stringMatching(/^blocks-[a-f0-9]{6}$/),
      files: { 'coco/basecase/frames.json': new Uint8Array([2]) },
      tag: 'dataset-v3',
    });
    expect(result.message).toBe('Published to user/blocks, left out 1 from another Case or design');
  });

  it('exports images without preparing tries and leaves failed exports unfrozen', async () => {
    expect(await imageDatasetDownload(dataset, records)).toEqual(new Uint8Array([1]));
    expect(state.tries).not.toHaveBeenCalled();
    expect(records.freeze).toHaveBeenCalledWith(dataset, '');
    records.freeze.mockClear();
    state.zip.mockRejectedValue(new Error('Changed image content'));
    await expect(imageDatasetDownload(dataset, records)).rejects.toThrow('Changed image content');
    expect(records.freeze).not.toHaveBeenCalled();
  });
});
