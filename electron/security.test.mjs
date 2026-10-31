import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppUrl, isExternalWebUrl } from './appOrigin.mjs';
import { SceneLibrary } from './library/sceneLibrary.mjs';
import { assertPublicUrl, isPublicAddress, publicFetch, readCapped } from './publicFetch.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('app origin', () => {
  const app = 'http://localhost:5173';

  it('trusts only the exact app origin', () => {
    expect(isAppUrl('http://localhost:5173/scene?id=1', app)).toBe(true);
    expect(isAppUrl('http://localhost:5173.evil.example/', app)).toBe(false);
    expect(isAppUrl('http://localhost:5174/', app)).toBe(false);
    expect(isAppUrl('https://localhost:5173/', app)).toBe(false);
    expect(isAppUrl('file:///etc/passwd', app)).toBe(false);
    expect(isAppUrl('not a url', app)).toBe(false);
  });

  it('opens only web links externally', () => {
    expect(isExternalWebUrl('https://example.com')).toBe(true);
    expect(isExternalWebUrl('file:///Applications/Calculator.app')).toBe(false);
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('public fetch', () => {
  it('refuses private, loopback and mapped addresses', async () => {
    const v4 = (...octets) => octets.join('.');
    const v6 = (...groups) => groups.join(':');
    const privateAddresses = [
      v4(127, 0, 0, 1),
      v4(10, 1, 2, 3),
      v4(192, 168, 1, 1),
      v4(100, 100, 1, 1),
      v4(169, 254, 169, 254),
      v6('', '', '1'),
      v6('fd00', '', '1'),
      v6('', '', 'ffff', v4(127, 0, 0, 1)),
    ];

    for (const ip of privateAddresses) expect(isPublicAddress(ip)).toBe(false);

    expect(isPublicAddress(v4(93, 184, 215, 14))).toBe(true);
    await expect(assertPublicUrl('http://2130706433/')).rejects.toThrow('public');
    await expect(assertPublicUrl('http://[::1]:5173/')).rejects.toThrow('public');
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow('public');
  });

  it('checks every redirect hop', async () => {
    const fetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:5173/' } }),
    );

    vi.stubGlobal('fetch', fetch);

    await expect(publicFetch('http://93.184.215.14/robot.urdf')).rejects.toThrow('public');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops reading a body past its cap', async () => {
    const big = new Response(new Uint8Array(2048));

    await expect(readCapped(big, 1024, 'The file')).rejects.toThrow('larger than');
    expect((await readCapped(new Response('ok'), 1024)).toString()).toBe('ok');
  });
});

describe('scene library ids', () => {
  let dir;

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('never reads, writes or deletes outside the scenes folder', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-'));

    const scenesDir = path.join(dir, 'scenes');
    const secret = path.join(dir, 'auth.json');

    fs.mkdirSync(scenesDir);
    fs.writeFileSync(secret, '{"token":"x"}');

    const library = new SceneLibrary({ scenesDir, cacheFile: path.join(dir, 'cache.json') });

    expect(library.get('../auth')).toBeNull();
    expect(() => library.save({ id: '../auth', name: 'x', parts: [] })).toThrow('Not a valid id');
    library.delete('../auth');

    expect(fs.readFileSync(secret, 'utf-8')).toBe('{"token":"x"}');
  });
});
