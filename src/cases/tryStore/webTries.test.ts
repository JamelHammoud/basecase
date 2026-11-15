import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../tryFile';
import type { TryVideoUpload } from './videoUploadTypes';

const databases = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../../utils/keyValueStore', () => ({
  indexedDbStore: ({ database }: { database: string }) => {
    const entries = () => {
      const existing = databases.get(database) ?? new Map<string, unknown>();

      databases.set(database, existing);

      return existing;
    };

    return {
      get: async (key: string) => entries().get(key),
      put: async (key: string, value: unknown) => entries().set(key, value),
      delete: async (key: string) => entries().delete(key),
      deletePrefix: async (prefix: string) => {
        for (const key of entries().keys()) if (key.startsWith(prefix)) entries().delete(key);
      },
      keys: async () => [...entries().keys()],
      values: async () => [...entries().values()],
    };
  },
}));

vi.mock('./videoUploadClient', () => ({
  saveTryVideos: async (videos: TryVideoUpload[]) => {
    const { uploadTryVideos } = await import('./videoUploadJobs');

    return uploadTryVideos({ videos, web: true, baseUrl: 'http://localhost/' });
  },
  saveTryCameraVideo: async (id: string, bytes: Uint8Array, camera = 'operator') => {
    const { uploadTryVideos } = await import('./videoUploadJobs');

    return uploadTryVideos({ videos: [{ id, bytes, camera }], web: true, baseUrl: 'http://localhost/' });
  },
}));

const manifest = (id: string): StoredTry => ({
  version: 1,
  id,
  sceneId: 'scene',
  robot: { name: 'Arm', modelHash: 'hash', joints: [] },
  case: null,
  source: 'import',
  input: null,
  startedAt: '2026-11-14T00:00:00.000Z',
  seconds: 2,
  rate: 50,
  frames: 100,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 0,
  sourceTry: null,
  faults: [],
  videos: [{ camera: 'front', path: 'videos/shared.mp4', from: 4, to: 6 }],
});

beforeEach(() => {
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, work: () => Promise<unknown>) => work() } });
  databases.clear();
  vi.resetModules();
});

afterEach(() => vi.unstubAllGlobals());

describe('camera videos in the web try store', () => {
  it('retains clips for a worker after reopening and deletes only the chosen try’s clips', async () => {
    const { webTries } = await import('./webTries');
    const { readWebTryVideo } = await import('./webTryVideos');

    await webTries.save(manifest('try-1'), null);
    await webTries.save(manifest('try-10'), null);
    await webTries.saveVideo('try-1', new Uint8Array([1, 2, 3]), 'front');
    await webTries.saveVideo('try-10', new Uint8Array([9]), 'front');
    vi.resetModules();

    const reopened = await import('./webTryVideos');
    const clip = await reopened.readWebTryVideo('try-1', 'front');

    expect(clip?.type).toBe('video/mp4');
    expect([...new Uint8Array(await clip!.arrayBuffer())]).toEqual([1, 2, 3]);
    expect((await webTries.manifests(['try-1']))[0].videos![0].from).toBe(4);
    await webTries.delete(['try-1']);
    expect(await readWebTryVideo('try-1', 'front')).toBeNull();
    expect((await readWebTryVideo('try-10', 'front'))?.size).toBe(1);
    expect(databases.get('basecase-try-videos')?.size).toBe(1);
  });

  it('keeps one content asset for shared episodes and releases it after the last try is deleted', async () => {
    const { webTries } = await import('./webTries');
    const { readWebTryVideo } = await import('./webTryVideos');
    const bytes = new Uint8Array([1, 2, 3]);

    await webTries.save(manifest('try-1'), null);
    await webTries.save(manifest('try-2'), null);
    await webTries.saveVideos(['try-1', 'try-2'].map((id) => ({ id, camera: 'front', bytes })));
    expect(databases.get('basecase-try-video-assets')?.size).toBe(1);
    await webTries.delete(['try-1']);
    expect((await readWebTryVideo('try-2', 'front'))?.size).toBe(3);
    expect(databases.get('basecase-try-video-assets')?.size).toBe(1);
    await webTries.delete(['try-2']);
    expect(databases.get('basecase-try-video-assets')?.size).toBe(0);
  });

  it('refuses absent and wrong cameras and hides clips removed from the manifest', async () => {
    const { webTries } = await import('./webTries');
    const { readWebTryVideo } = await import('./webTryVideos');

    await expect(webTries.saveVideo('gone', new Uint8Array([1]), 'front')).rejects.toThrow('Import');
    await webTries.save(manifest('try-1'), null);
    await expect(webTries.saveVideo('try-1', new Uint8Array([1]), 'other')).rejects.toThrow('Import');
    expect(await readWebTryVideo('try-1', 'other')).toBeNull();
    await webTries.saveVideo('try-1', new Uint8Array([1]), 'front');
    await webTries.update({ ...manifest('try-1'), videos: [] });
    expect(await readWebTryVideo('try-1', 'front')).toBeNull();
  });
});
