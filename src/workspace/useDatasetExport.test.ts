import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newDataset } from '../datasets/datasetFile';
import type { DatasetExport } from './useDatasetExport';
import type { PreparedDataset } from './datasetJob';

const state = vi.hoisted(() => ({
  prepare: vi.fn(),
  deliverImages: vi.fn(),
  downloadImages: vi.fn(),
  records: { of: vi.fn(), freeze: vi.fn() },
  showToast: vi.fn(),
}));

vi.mock('./datasetJob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./datasetJob')>()),
  prepareDataset: state.prepare,
}));
vi.mock('./useDatasetRecords', () => ({ useDatasetRecords: () => state.records }));
vi.mock('./deliverImageDataset', () => ({
  deliverImageDataset: state.deliverImages,
  imageDatasetDownload: state.downloadImages,
}));
vi.mock('../hub/hubBridge', () => ({ hubBridge: { signedIn: async () => true } }));

import { useDatasetExport } from './useDatasetExport';

const dataset = newDataset({
  id: 'mixed',
  name: 'Blocks',
  members: ['old-try'],
  imageMembers: [{ frameSetId: 'frames', frameIds: ['frame'], hash: 'a'.repeat(64) }],
  task: 'Pick a block',
  at: 'now',
});

function exporter() {
  const result: { current?: DatasetExport } = {};

  function Harness() {
    result.current = useDatasetExport({
      sim: { model: {}, worldParts: [], guestParts: [] } as unknown as Parameters<typeof useDatasetExport>[0]['sim'],
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
  state.prepare.mockResolvedValue(null);
  state.deliverImages.mockResolvedValue({ message: 'Exported 1 image' });
  state.downloadImages.mockResolvedValue(new Uint8Array([1]));
});

describe('mixed dataset delivery', () => {
  it.each(['exportDataset', 'publishDataset'] as const)(
    'keeps saved images without fitting tries on %s',
    async (action) => {
      exporter()[action](dataset);
      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Exported 1 image', undefined));
      expect(state.deliverImages).toHaveBeenCalledWith(dataset, state.records, action === 'publishDataset', undefined);
    },
  );

  it('keeps saved images in ZIP requests without fitting tries', async () => {
    expect(await exporter().zipDataset(dataset)).toEqual(new Uint8Array([1]));
    expect(state.downloadImages).toHaveBeenCalledWith(dataset, state.records, undefined);
  });

  it('retains fitting try files alongside the images', async () => {
    const prepared = { modelHash: 'robot', used: 1 } as PreparedDataset;

    state.prepare.mockResolvedValue(prepared);
    await exporter().zipDataset(dataset);
    expect(state.downloadImages).toHaveBeenCalledWith(dataset, state.records, prepared);
  });

  it('still refuses a try-only dataset without fitting tries', async () => {
    const tries = { ...dataset, imageMembers: undefined };

    expect(await exporter().zipDataset(tries)).toBeNull();
    expect(state.downloadImages).not.toHaveBeenCalled();
  });
});
