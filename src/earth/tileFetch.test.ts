import { describe, expect, it, vi } from 'vitest';
import { EarthFetchPlugin } from './tileFetch';
import { FIXTURE_SESSION, fixtureTileBytes } from './tileFixture';
import { TILES_ROOT_URL } from './tilePaths';

const fixture = vi.fn(async (path: string) => fixtureTileBytes(path) ?? new Uint8Array());

describe('EarthFetchPlugin', () => {
  it('reads the root as JSON, then sends its session with every later tile', async () => {
    const plugin = new EarthFetchPlugin(fixture);
    const root = (await plugin.fetchData(TILES_ROOT_URL)) as { root: unknown };
    const glb = (await plugin.fetchData('https://tile.googleapis.com/v1/3dtiles/files/r0.glb?key=x')) as ArrayBuffer;

    expect(root.root).toBeDefined();
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe('glTF');
    expect(fixture).toHaveBeenLastCalledWith(`/v1/3dtiles/files/r0.glb?session=${FIXTURE_SESSION}`);
  });

  it('refuses a tile off the tile host before asking the main process', async () => {
    const fetchTile = vi.fn();
    const plugin = new EarthFetchPlugin(fetchTile);
    const hostile = [
      'https://attacker.example/v1/3dtiles/root.json',
      '//attacker.example/v1/3dtiles/root.json',
      'https://tile.googleapis.com/v1/other/root.json',
      'https://tile.googleapis.com/maps/api/geocode/json',
      'http://tile.googleapis.com/v1/3dtiles/root.json',
    ];

    for (const url of hostile) await expect(plugin.fetchData(url)).rejects.toThrow(/left tile.googleapis.com/);

    expect(fetchTile).not.toHaveBeenCalled();
  });
});
