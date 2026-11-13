import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlResolver } from './sources';

const RAW = 'https://raw.githubusercontent.com/';
const ENTRY = `${RAW}me/arm/main/urdf/arm.urdf`;
const fetched: string[] = [];

beforeEach(() => {
  fetched.length = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);

    return new Response(url === ENTRY ? '<robot name="arm"/>' : 'mesh');
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('urlResolver on a GitHub file link', () => {
  it('never fetches an absolute mesh or include outside its owner, repo and ref', async () => {
    const resolver = await urlResolver('https://github.com/me/arm/blob/main/urdf/arm.urdf');
    const outside = [
      `${RAW}other/repo/main/x.stl`,
      `${RAW}me/arm/dev/x.stl`,
      `${RAW}me/arm/main/../../other/main/x.stl`,
      `${RAW}me/arm/main/%2e%2e/%2e%2e/other/main/x.stl`,
      'https://evil.example/me/arm/main/x.stl',
      'http://raw.githubusercontent.com.evil.example/me/arm/main/x.stl',
    ];

    for (const ref of outside) expect(await resolver.read(ref, '/me/arm/main/urdf/arm.urdf')).toBeNull();

    expect(fetched).toEqual([ENTRY]);
  });

  it('reads an absolute link inside its own repo', async () => {
    const resolver = await urlResolver('https://github.com/me/arm/blob/main/urdf/arm.urdf');
    const got = await resolver.read(`${RAW}me/arm/main/meshes/base.stl`, '/me/arm/main/urdf/arm.urdf');

    expect(got?.path).toBe(`${RAW}me/arm/main/meshes/base.stl`);
  });
});
