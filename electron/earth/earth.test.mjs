import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AWAY_PATH, startFakeTiles } from '../../e2e/fakeTiles.ts';
import { FIXTURE_SESSION } from '../../src/earth/tileFixture.ts';
import { EARTH_CALLS } from './routes.mjs';
import { EarthTiles, KEY_REFUSED, NO_KEY, OFF_HOST, ROOT_PATH, tilesEndpoint, tileUrl } from './index.mjs';

const KEY = 'test-map-tiles-key-that-must-never-leave';

const sealing = {
  available: () => true,
  encrypt: (value) => Buffer.from([...value].reverse().join('')).toString('base64'),
  decrypt: (sealed) => [...Buffer.from(sealed, 'base64').toString()].reverse().join(''),
};

const servers = [];
let dir;

const serve = async (options) => {
  const server = await startFakeTiles(options);

  servers.push(server);

  return server;
};

const earth = (endpoint, outbound) => {
  dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'earth-tiles-'));

  return new EarthTiles({ libraryDir: dir, secrets: sealing, endpoint: () => endpoint, ...(outbound && { outbound }) });
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  dir = undefined;
  vi.restoreAllMocks();
});

describe('Map Tiles endpoint', () => {
  it('is tile.googleapis.com unless overridden with https or a loopback http address', () => {
    expect(tilesEndpoint(undefined)).toBe('https://tile.googleapis.com');
    expect(tilesEndpoint('http://127.0.0.1:9000/x')).toBe('http://127.0.0.1:9000');
    expect(() => tilesEndpoint('http://tiles.example.com')).toThrow(/https, or http on this computer/);
  });
});

describe('Map Tiles key', () => {
  it('checks a key with the tile host, seals it, and never hands it back', async () => {
    const tiles = await serve({ key: KEY });
    const account = earth(tiles.url);

    await expect(account.setKey('another-map-tiles-key-google-refuses')).rejects.toThrow(KEY_REFUSED);
    expect(account.account()).toEqual({ saved: false });
    await expect(account.setKey('not a key')).rejects.toThrow('That isn’t a Map Tiles key.');
    expect(await account.setKey(` ${KEY} `)).toEqual({ saved: true });
    expect(tiles.requests.at(-1)).toMatchObject({ path: ROOT_PATH, key: KEY });

    const onDisk = fs.readFileSync(path.join(dir, 'agent-config', 'earth-keys.json'), 'utf-8');

    expect(onDisk).not.toContain(KEY);
    expect(JSON.stringify(await EARTH_CALLS['earth:account'](account))).not.toContain(KEY);
  });

  it('asks for a key before any tile request', async () => {
    const outbound = vi.fn();

    await expect(earth('https://tile.googleapis.com', outbound).tile(ROOT_PATH)).rejects.toThrow(NO_KEY);
    expect(outbound).not.toHaveBeenCalled();
  });
});

describe('Map tiles', () => {
  it('adds the key and keeps the session on the fixed host', async () => {
    const tiles = await serve({ key: KEY });
    const account = earth(tiles.url);

    await account.setKey(KEY);

    const root = await account.tile(ROOT_PATH);
    const glb = await account.tile(`/v1/3dtiles/files/r.glb?session=${FIXTURE_SESSION}&key=stolen`);

    expect(JSON.parse(Buffer.from(root.data).toString()).root.children).toHaveLength(4);
    expect(Buffer.from(glb.data).subarray(0, 4).toString()).toBe('glTF');
    expect(tiles.requests.at(-1)).toEqual({ path: '/v1/3dtiles/files/r.glb', key: KEY, session: FIXTURE_SESSION });
  });

  it('refuses any request off the fixed host before it leaves the computer', async () => {
    const outbound = vi.fn();
    const account = earth('https://tile.googleapis.com', outbound);

    account.keys.set('google-map-tiles', KEY);

    const hostile = [
      'https://attacker.example/v1/3dtiles/root.json',
      '//attacker.example/v1/3dtiles/root.json',
      '/\\attacker.example/v1/3dtiles/root.json',
      '/v1/3dtiles/../../attacker',
      '/v1/3dtiles/%2e%2e/%2e%2e/attacker',
      '/v1/3dtiles/a@attacker.example',
      '/maps/api/geocode/json',
      'v1/3dtiles/root.json',
      { toString: () => ROOT_PATH },
      undefined,
    ];

    for (const request of hostile) await expect(account.tile(request)).rejects.toThrow(OFF_HOST);

    expect(outbound).not.toHaveBeenCalled();
    expect(tileUrl('https://tile.googleapis.com', '/v1/3dtiles/root.json?session=a"b').href).toBe(
      'https://tile.googleapis.com/v1/3dtiles/root.json',
    );
  });

  it('refuses a redirect off the tile host, so the key never follows it', async () => {
    const elsewhere = await serve({ key: 'nothing-reaches-here-0000000000' });
    const tiles = await serve({ key: KEY, awayTo: `${elsewhere.url}${ROOT_PATH}` });
    const account = earth(tiles.url);

    await account.setKey(KEY);
    await expect(account.tile(AWAY_PATH)).rejects.toThrow();
    expect(elsewhere.requests).toEqual([]);
  });

  it('names Google’s refusal without the key', async () => {
    const tiles = await serve({ key: KEY });
    const account = earth(tiles.url);

    await account.setKey(KEY);
    account.keys.set('google-map-tiles', 'revoked-map-tiles-key-google-refuses');

    const error = await account.tile('/v1/3dtiles/files/r0.glb').catch((e) => e);

    expect(error.message).toBe(KEY_REFUSED);
  });
});
