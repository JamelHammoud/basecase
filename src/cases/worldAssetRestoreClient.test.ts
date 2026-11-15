import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreWorldAssetsInWorker } from './worldAssetRestoreClient';
import { meshWorldAsset } from './worldAssets.fixtures';
import { getWorldAsset, hashWorldAsset, restoreWorldAssets, serializeWorldAssets } from './worldAssets';
import { worldAssetRestoreHandlers } from './worldAssetRestore';

const workers: RestoreWorker[] = [];

class RestoreWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    workers.push(this);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('world asset restore client', () => {
  it('registers the validated result only after the worker replies and releases the worker', async () => {
    const asset = meshWorldAsset();

    asset.world.name = 'Worker client registration';

    const hash = await hashWorldAsset(asset);
    const table = serializeWorldAssets({ [hash]: asset });

    vi.stubGlobal('Worker', RestoreWorker);

    const waiting = restoreWorldAssets(table);
    const worker = workers.at(-1)!;

    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, op: 'restoreWorldAssets', payload: table }, []);
    expect(getWorldAsset(hash)).toBeUndefined();

    const { result } = await worldAssetRestoreHandlers.restoreWorldAssets(table);

    worker.onmessage?.({ data: { id: 1, result } });

    const restored = await waiting;

    expect(getWorldAsset(hash)).toBe(restored[hash]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('refuses an unavailable or failed browser worker without decoding on the page', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', undefined);

    await expect(restoreWorldAssetsInWorker({ malformed: true })).rejects.toThrow('worker is unavailable');

    vi.stubGlobal('Worker', RestoreWorker);

    const waiting = restoreWorldAssetsInWorker({ malformed: true });
    const worker = workers.at(-1)!;

    worker.onerror?.({ message: 'Worker failed' });

    await expect(waiting).rejects.toThrow('worker is unavailable');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
