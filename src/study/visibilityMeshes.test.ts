import { afterEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { visibilityMeshFiles } from './visibilityMeshes';

vi.mock('../three/componentMeshes', () => ({
  componentMeshUrl: (id: string) => `/parts/${id}.glb`,
  sourcedMeshFiles: async () => ({}),
}));

afterEach(() => vi.unstubAllGlobals());

it('supplies catalog bytes before source-model preparation and reuses the immutable preparation', async () => {
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  const parts = [{ ...box('eye', [0, 0, 0], [25, 12, 24], 3), componentId: 'raspberry-pi-camera-3' }];

  vi.stubGlobal('fetch', fetch);

  const first = await visibilityMeshFiles(parts);
  const repeated = await visibilityMeshFiles(parts);

  expect(fetch).toHaveBeenCalledExactlyOnceWith('/parts/raspberry-pi-camera-3.glb');
  expect(repeated).toBe(first);
  expect(new Uint8Array(first['raspberry-pi-camera-3'])).toEqual(Uint8Array.of(1, 2, 3));
});

it('keeps unknown catalog IDs out of asset URLs and rejects missing catalog geometry', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 404 }));

  vi.stubGlobal('fetch', fetch);
  await visibilityMeshFiles([{ ...box('unknown', [0, 0, 0], [1, 1, 1], 1), componentId: '../../private' }]);
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    visibilityMeshFiles([{ ...box('eye', [0, 0, 0], [25, 12, 24], 3), componentId: 'raspberry-pi-camera-3' }]),
  ).rejects.toThrow('catalog meshes');
});
