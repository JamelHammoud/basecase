import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetStore } from '../../../electron/library/datasetStore.mjs';
import { datasetPostRoutes } from '../../../electron/library/datasetRoutes.mjs';
import { datasetContentFromBase64 } from './contentBytes';
import { freezeVersion, newDataset } from '../datasetFile';

const transport = vi.hoisted(() => ({
  invoke: undefined as undefined | ((channel: string, payload?: unknown) => Promise<unknown>),
  post: vi.fn(),
}));

vi.mock('../../utils/platform/transport', () => ({
  electron: () => ({ datasetsCall: transport.invoke }),
  post: transport.post,
}));

const { desktopDatasets } = await import('./desktopDatasets');
const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const bytes = () => new TextEncoder().encode('abc');
let dir: string;
let store: DatasetStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-content-'));

  store = new DatasetStore({ dir });

  const routes = datasetPostRoutes(store);

  transport.invoke = undefined;
  transport.post.mockReset().mockImplementation(async (url: string, body: { arg?: unknown }) => {
    const route = routes.find(([prefix]) => prefix === url);

    if (!route) throw new Error('Missing route');

    return route[1](body);
  });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('desktop dataset content transport', () => {
  it('round-trips bytes over the actual HTTP routes', async () => {
    expect(await desktopDatasets.saveContent(bytes())).toBe(HASH);
    expect(transport.post).toHaveBeenCalledWith('/datasets-content-save', { arg: 'YWJj' });
    expect(await desktopDatasets.content(HASH)).toEqual(bytes());
    expect(await desktopDatasets.content('0'.repeat(64))).toBeNull();
  });

  it('verifies hashes returned by IPC and refuses corrupt or malformed HTTP replies', async () => {
    transport.invoke = async (channel) => (channel === 'datasets:content-save' ? '0'.repeat(64) : new Uint8Array([1]));
    await expect(desktopDatasets.saveContent(bytes())).rejects.toThrow('match');
    await expect(desktopDatasets.content(HASH)).rejects.toThrow('match');
    transport.invoke = undefined;
    transport.post.mockResolvedValue({ data: 'YWJk' });
    await expect(desktopDatasets.content(HASH)).rejects.toThrow('match');
    transport.post.mockResolvedValue({ data: '../auth' });
    await expect(desktopDatasets.content(HASH)).rejects.toThrow('base64');
    transport.post.mockClear();
    await expect(desktopDatasets.content('../auth')).rejects.toThrow('hash');
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('rejects noncanonical base64 and accepts an empty blob', () => {
    for (const value of ['YQ', 'YQ==\n', 'YR==', 'YW Jj', 'Y===', 7, null]) {
      expect(() => datasetContentFromBase64(value)).toThrow('base64');
    }

    expect(datasetContentFromBase64('')).toEqual(new Uint8Array());
  });

  it('returns the committed version history merged by the main process', async () => {
    const dataset = newDataset({ id: 'dataset', name: 'Blocks', task: 'Pick', members: [], at: 'now' });
    const frozen = freezeVersion(dataset, 'first', 'now').dataset;

    await desktopDatasets.save(dataset);
    store.save(frozen);
    expect(await desktopDatasets.save({ ...dataset, name: 'Renamed' })).toEqual({ ...frozen, name: 'Renamed' });
  });

  it('refuses a malformed saved record or a reply naming another dataset', async () => {
    const dataset = newDataset({ id: 'dataset', name: 'Blocks', task: 'Pick', members: [], at: 'now' });

    transport.post.mockResolvedValue({ ok: true });
    await expect(desktopDatasets.save(dataset)).rejects.toThrow('damaged');
    transport.post.mockResolvedValue({ ok: true, dataset: { ...dataset, id: 'another' } });
    await expect(desktopDatasets.save(dataset)).rejects.toThrow('damaged');
  });
});
