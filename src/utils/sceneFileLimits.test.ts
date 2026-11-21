import { gzipSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';
import { decodeSceneFile, MAX_SCENE_BYTES } from './sceneFile';
import { readCapped } from './readCapped';

vi.mock('./readCapped', async (original) => {
  const real = await original<typeof import('./readCapped')>();

  return { ...real, readCapped: vi.fn((response: Response) => real.readCapped(response, 64 * 1024)) };
});

it('enforces the scene budget on both gzip expansion and plain JSON', async () => {
  const expanded = new Uint8Array(128 * 1024).fill(32);
  const compressed = gzipSync(expanded);

  await expect(decodeSceneFile(compressed)).rejects.toThrow('128 MB');
  await expect(decodeSceneFile(expanded)).rejects.toThrow('128 MB');
  expect(MAX_SCENE_BYTES).toBe(128 * 1024 * 1024);
  expect(readCapped).toHaveBeenCalledTimes(2);
  expect(readCapped).toHaveBeenNthCalledWith(1, expect.any(Response), MAX_SCENE_BYTES);
  expect(readCapped).toHaveBeenNthCalledWith(2, expect.any(Response), MAX_SCENE_BYTES);
});
