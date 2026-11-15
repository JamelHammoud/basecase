import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDataset, type DatasetVersion } from '../datasets/datasetFile';
import type { DatasetExport } from './useDatasetExport';
import type { PreparedDataset } from './datasetJob';

const state = vi.hoisted(() => ({
  prepare: vi.fn(),
  deliver: vi.fn(),
  download: vi.fn(),
  buildModel: vi.fn(),
  records: { of: vi.fn(), freeze: vi.fn(), resolve: vi.fn(), scene: vi.fn(), archive: vi.fn() },
  showToast: vi.fn(),
}));

vi.mock('./datasetJob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./datasetJob')>()),
  prepareDataset: state.prepare,
}));
vi.mock('./useDatasetRecords', () => ({ useDatasetRecords: () => state.records }));
vi.mock('./deliverImageDataset', () => ({ deliverDataset: state.deliver, datasetDownload: state.download }));
vi.mock('../hub/hubBridge', () => ({ hubBridge: { signedIn: async () => true } }));

import { useDatasetExport } from './useDatasetExport';

const dataset = newDataset({
  id: 'mixed',
  name: 'Blocks',
  members: ['old-try'],
  task: 'Pick a block',
  at: 'now',
  imageMembers: [{ frameSetId: 'frames', frameIds: ['frame'], hash: 'a'.repeat(64) }],
});
const frozenScene = { model: { xml: 'frozen' }, robotName: 'Frozen arm', parts: [], world: [], guests: [], kase: null };
const version = (): DatasetVersion => ({
  n: 2,
  hash: 'hash',
  at: 'frozen',
  members: ['old-try'],
  imageMembers: dataset.imageMembers,
  snapshot: {
    task: 'Frozen task',
    modelHash: 'model',
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
    samples: [{ tryId: 'old-try' }] as NonNullable<DatasetVersion['snapshot']>['samples'],
  },
});

function exporter(hasModel = true) {
  const result: { current?: DatasetExport } = {};

  function Harness() {
    result.current = useDatasetExport({
      sim: {
        model: hasModel ? { xml: 'current' } : null,
        buildModel: state.buildModel,
        worldParts: [],
        guestParts: [],
      } as unknown as Parameters<typeof useDatasetExport>[0]['sim'],
      rig: { robots: [] } as unknown as Parameters<typeof useDatasetExport>[0]['rig'],
      parts: [],
      cases: [],
      active: null,
      sceneTries: [],
      showToast: state.showToast,
      openAccounts: vi.fn(),
    });

    return null;
  }

  renderToString(createElement(Harness));

  return result.current!;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.records.of.mockReturnValue([]);
  state.records.resolve.mockResolvedValue(version());
  state.records.scene.mockResolvedValue(frozenScene);
  state.buildModel.mockRejectedValue(new Error('Current scene unavailable'));
  state.prepare.mockResolvedValue(null);
  state.deliver.mockResolvedValue({ message: 'Exported 1 image' });
  state.download.mockResolvedValue(new Uint8Array([1]));
});

describe('frozen dataset export requests', () => {
  it.each(['exportDataset', 'publishDataset'] as const)(
    'resolves before preparing saved samples on %s',
    async (action) => {
      const frozen = version();

      state.records.resolve.mockResolvedValue(frozen);
      exporter()[action](dataset);
      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Exported 1 image', undefined));
      expect(state.records.resolve).toHaveBeenCalledWith(
        dataset,
        { xml: 'current' },
        expect.objectContaining({ model: { xml: 'current' } }),
      );
      expect(state.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ scene: frozenScene, snapshot: frozen.snapshot, records: [], task: 'Frozen task' }),
      );
      expect(state.records.resolve.mock.invocationCallOrder[0]).toBeLessThan(state.prepare.mock.invocationCallOrder[0]);
      expect(state.deliver).toHaveBeenCalledWith(dataset, state.records, action === 'publishDataset', {
        version: frozen,
        prepared: undefined,
      });
    },
  );

  it('uses an archived selected version without building the current model or preparing tries', async () => {
    const frozen = { ...version(), archive: 'c'.repeat(64) };
    const selected = { ...dataset, selectedVersion: 2, versions: [frozen] };

    state.records.resolve.mockResolvedValue(frozen);
    expect(await exporter(false).zipDataset(selected)).toEqual(new Uint8Array([1]));
    expect(state.records.resolve).toHaveBeenCalledWith(selected);
    expect(state.buildModel).not.toHaveBeenCalled();
    expect(state.records.scene).not.toHaveBeenCalled();
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.download).toHaveBeenCalledWith(selected, state.records, { version: frozen });
  });

  it('freezes image-only content without needing a model', async () => {
    const frozen = version();

    frozen.snapshot!.samples = [];
    state.records.resolve.mockResolvedValue(frozen);
    expect(await exporter(false).zipDataset({ ...dataset, members: [] })).toEqual(new Uint8Array([1]));
    expect(state.buildModel).not.toHaveBeenCalled();
    expect(state.records.resolve).toHaveBeenCalledWith({ ...dataset, members: [] }, undefined, undefined);
    expect(state.prepare).not.toHaveBeenCalled();
  });

  it('retains fitting try files and refuses a try-only version without exportable samples', async () => {
    const frozen = version();
    const prepared = { modelHash: 'robot', used: 1 } as PreparedDataset;

    state.records.resolve.mockResolvedValue(frozen);
    state.prepare.mockResolvedValue(prepared);
    await exporter().zipDataset(dataset);
    expect(state.download).toHaveBeenCalledWith(dataset, state.records, { version: frozen, prepared });
    frozen.snapshot!.images = [];
    state.prepare.mockResolvedValue(null);
    state.download.mockClear();
    expect(await exporter().zipDataset(dataset)).toBeNull();
    expect(state.download).not.toHaveBeenCalled();
  });

  it('refuses a missing historical scene instead of replacing it with the current robot', async () => {
    state.records.scene.mockResolvedValue(null);
    await expect(exporter().zipDataset(dataset)).rejects.toThrow('The dataset is missing its saved scene.');
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
  });
});
