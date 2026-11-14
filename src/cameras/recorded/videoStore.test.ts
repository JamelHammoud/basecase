import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteVideoBlobs, keepSharedVideoBlob, loadVideoBlob } from './videoStore';

const rows = vi.hoisted(() => new Map<string, Blob | string>());

vi.mock('../../utils/keyValueStore', () => ({
  indexedDbStore: () => ({
    get: async (key: string) => rows.get(key),
    put: async (key: string, value: Blob | string) => rows.set(key, value),
    keys: async () => [...rows.keys()],
    delete: async (key: string) => rows.delete(key),
    deletePrefix: async (prefix: string) => {
      [...rows.keys()].filter((key) => key.startsWith(prefix)).forEach((key) => rows.delete(key));
    },
  }),
}));

beforeEach(() => rows.clear());

describe('shared imported video chunks', () => {
  it('keeps one clip for multiple episodes and releases it after the final try is deleted', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);

    await keepSharedVideoBlob('chunk', blob, [
      { id: 'one', path: 'chunk.mp4' },
      { id: 'two', path: 'chunk.mp4' },
    ]);
    expect(await loadVideoBlob('one', 'chunk.mp4')).toBe(blob);
    expect(await loadVideoBlob('two', 'chunk.mp4')).toBe(blob);
    await deleteVideoBlobs(['one']);
    expect(await loadVideoBlob('one', 'chunk.mp4')).toBeNull();
    expect(await loadVideoBlob('two', 'chunk.mp4')).toBe(blob);
    await deleteVideoBlobs(['two']);
    expect(rows.size).toBe(0);
  });

  it('releases a shared clip when every referring try is deleted together', async () => {
    await keepSharedVideoBlob('chunk', new Blob(['clip']), [
      { id: 'one', path: 'clip' },
      { id: 'two', path: 'clip' },
    ]);
    await deleteVideoBlobs(['one', 'two']);
    expect(rows.size).toBe(0);
  });
});
