import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDataset, type DatasetVersion } from '../datasets/datasetFile';
import { zipFolder } from '../utils/zipFolder';
import type { PreparedDataset } from './datasetJob';
import type { DatasetRecords } from './useDatasetRecords';

const state = vi.hoisted(() => ({
  zip: vi.fn(),
  files: vi.fn(),
  tryFiles: vi.fn(),
  tryZip: vi.fn(),
  download: vi.fn(),
  publish: vi.fn(),
  load: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('../vision/imageDataset', () => ({ imageDatasetZip: state.zip, imageDatasetFiles: state.files }));
vi.mock('../datasets/datasetClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../datasets/datasetClient')>()),
  exportDatasetFiles: state.tryFiles,
  exportDatasetZip: state.tryZip,
}));
vi.mock('../datasets/datasetStore/content', () => ({ loadDatasetContent: state.load, saveDatasetContent: vi.fn() }));
vi.mock('../utils/downloadBytes', () => ({ downloadBytes: state.download }));
vi.mock('../hub/hubBridge', () => ({ hubBridge: { publish: state.publish } }));

import { deliverDataset, datasetDownload } from './deliverImageDataset';

const dataset = newDataset({
  id: 'mixed',
  name: 'Blocks',
  members: ['try'],
  task: 'Pick a block',
  at: 'now',
  imageMembers: [{ frameSetId: 'frames', frameIds: ['frame'], hash: 'a'.repeat(64) }],
});
const files = {
  'coco/basecase/frames.json': strToU8('{"frozen":true}'),
  'meta/info.json': strToU8('{"splits":{"validation":"0:1"}}'),
};
const bytes = zipFolder('mixed', files);
const records = { archive: state.archive } as unknown as DatasetRecords;
const prepared = { used: 2, left: 1, modelHash: 'robot', job: {} } as PreparedDataset;
const version = (): DatasetVersion => ({
  n: 3,
  hash: 'hash',
  at: 'frozen',
  members: ['try'],
  imageMembers: dataset.imageMembers,
  snapshot: {
    task: 'Frozen task',
    modelHash: 'robot',
    samples: [],
    images: [
      {
        frameSetId: 'frames',
        frameId: 'frame',
        hash: 'a'.repeat(64),
        content: 'b'.repeat(64),
        source: 'frozen-source',
        split: 'test',
      },
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  state.zip.mockResolvedValue(bytes.slice());
  state.tryZip.mockResolvedValue(bytes.slice());
  state.tryFiles.mockResolvedValue({ 'meta/info.json': files['meta/info.json'] });
  state.load.mockResolvedValue(bytes.slice());
  state.archive.mockResolvedValue(bytes.slice());
  state.publish.mockResolvedValue({ repo: 'user/blocks', url: 'https://huggingface.co/datasets/user/blocks' });
});

describe('frozen dataset delivery', () => {
  it('builds mixed downloads from frozen images and fitting tries and saves the exact archive', async () => {
    const frozen = version();
    const result = await deliverDataset(dataset, records, false, { version: frozen, prepared });

    expect(state.zip).toHaveBeenCalledWith(
      { ...dataset, task: 'Frozen task' },
      { 'meta/info.json': files['meta/info.json'] },
      frozen.snapshot!.images,
    );
    expect(state.archive).toHaveBeenCalledWith(dataset, frozen, bytes);
    expect(state.download).toHaveBeenCalledWith(bytes, 'blocks-dataset.zip', 'application/zip');
    expect(result.message).toBe('Exported 1 image and 2 tries, left out 1');
  });

  it('publishes the same cached bytes without reading live images or rendering tries', async () => {
    const frozen = { ...version(), archive: 'c'.repeat(64) };

    frozen.snapshot!.dataset = {
      id: dataset.id,
      name: 'Frozen blocks',
      createdAt: dataset.createdAt,
      sceneId: null,
      caseId: null,
      seed: dataset.seed,
    };

    const result = await deliverDataset({ ...dataset, name: 'Edited name' }, records, true, { version: frozen });

    expect(state.load).toHaveBeenCalledWith(frozen.archive);
    expect(state.zip).not.toHaveBeenCalled();
    expect(state.tryFiles).not.toHaveBeenCalled();
    expect(state.tryZip).not.toHaveBeenCalled();
    expect(state.archive).not.toHaveBeenCalled();
    expect(state.publish).toHaveBeenCalledWith({
      name: expect.stringMatching(/^frozen-blocks-[a-f0-9]{6}$/),
      files,
      tag: 'dataset-v3',
    });
    expect(result.message).toBe('Published to user/blocks');
  });

  it('archives a newly built image-only package before publishing its extracted files', async () => {
    const frozen = version();

    await deliverDataset(dataset, records, true, { version: frozen });
    expect(state.tryFiles).not.toHaveBeenCalled();
    expect(state.zip).toHaveBeenCalledWith({ ...dataset, task: 'Frozen task' }, {}, frozen.snapshot!.images);
    expect(state.archive).toHaveBeenCalledWith(dataset, frozen, bytes);
    expect(state.publish).toHaveBeenCalledWith(expect.objectContaining({ files, tag: 'dataset-v3' }));
  });

  it('does not create an archive after generation fails and refuses missing archived content', async () => {
    state.zip.mockRejectedValue(new Error('Frozen content missing'));
    await expect(datasetDownload(dataset, records, { version: version() })).rejects.toThrow('Frozen content missing');
    expect(state.archive).not.toHaveBeenCalled();
    state.load.mockResolvedValue(null);
    await expect(
      datasetDownload(dataset, records, { version: { ...version(), archive: 'c'.repeat(64) } }),
    ).rejects.toThrow('The dataset is missing its saved export.');
    expect(state.zip).toHaveBeenCalledTimes(1);
  });

  it('archives try-only packages through the existing dataset worker', async () => {
    const frozen = version();

    frozen.snapshot!.images = [];

    expect(await datasetDownload(dataset, records, { version: frozen, prepared })).toEqual(bytes);
    expect(state.tryZip).toHaveBeenCalledWith(prepared.job);
    expect(state.zip).not.toHaveBeenCalled();
    expect(state.archive).toHaveBeenCalledWith(dataset, frozen, bytes);
  });

  it('delivers the authoritative archive when another request already saved the version', async () => {
    const saved = zipFolder('mixed', { 'meta/info.json': strToU8('{"savedBy":"first request"}') });

    state.archive.mockResolvedValue(saved);
    await deliverDataset(dataset, records, false, { version: version(), prepared });
    expect(state.download).toHaveBeenCalledWith(saved, 'blocks-dataset.zip', 'application/zip');
    expect(state.download.mock.calls[0][0]).not.toEqual(bytes);
  });

  it('refuses traversal paths and oversized expanded archives before publishing', async () => {
    const frozen = { ...version(), archive: 'c'.repeat(64) };

    state.load.mockResolvedValue(zipFolder('mixed', { '../outside.txt': new Uint8Array([1]) }));
    await expect(deliverDataset(dataset, records, true, { version: frozen })).rejects.toThrow(
      'The dataset export is damaged.',
    );

    const oversized = bytes.slice();
    const at = oversized.findIndex(
      (value, index) =>
        value === 0x50 && oversized[index + 1] === 0x4b && oversized[index + 2] === 1 && oversized[index + 3] === 2,
    );

    new DataView(oversized.buffer).setUint32(at + 24, 1_000_000_001, true);
    state.load.mockResolvedValue(oversized);
    await expect(deliverDataset(dataset, records, true, { version: frozen })).rejects.toThrow(
      'The dataset export exceeds its size limit.',
    );
    expect(state.publish).not.toHaveBeenCalled();
  });
});
