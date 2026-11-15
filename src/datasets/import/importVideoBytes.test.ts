import { describe, expect, it, vi } from 'vitest';
import type { StoredTry } from '../../cases/tryFile';
import type { Recording } from '../../sim/recorder';
import { importVideoBytes } from './importVideoBytes';
import type { BuiltTries } from './importedTries';

const builtWith = (path: string): BuiltTries => ({
  refused: 0,
  kept: [0, 1].map((n) => ({
    stored: { id: `try-${n}`, videos: [{ camera: 'front', path, from: n * 2, to: n * 2 + 2 }] } as StoredTry,
    recording: {} as Recording,
  })),
});

describe('imported camera video bytes', () => {
  it('reads a shared local clip once and preserves each episode source offset', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const read = vi.fn(async () => bytes);
    const built = await importVideoBytes(builtWith('videos/shared.mp4'), [
      { path: 'videos/shared.mp4', size: 3, read },
    ]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(built.kept.map((entry) => entry.videos)).toEqual([
      [{ camera: 'front', bytes }],
      [{ camera: 'front', bytes }],
    ]);
    expect(built.kept.map((entry) => entry.stored.videos![0].from)).toEqual([0, 2]);
  });

  it('keeps metadata for Hub clips that were not downloaded without fetching another path', async () => {
    const built = await importVideoBytes(builtWith('videos/shared.mp4'), []);

    expect(built.kept[0].videos).toEqual([]);
    expect(built.kept[0].stored.videos![0].path).toBe('videos/shared.mp4');
  });

  it('refuses traversal and oversized clips before reading bytes', async () => {
    const read = vi.fn(async () => new Uint8Array());

    await expect(importVideoBytes(builtWith('../secret.mp4'), [])).rejects.toThrow('outside the dataset');
    await expect(
      importVideoBytes(builtWith('big.mp4'), [{ path: 'big.mp4', size: 513 * 1024 * 1024, read }]),
    ).rejects.toThrow('too large');
    expect(read).not.toHaveBeenCalled();
  });
});
