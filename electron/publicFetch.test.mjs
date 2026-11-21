import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isPublicAddress, publicFetch } from './publicFetch.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public fetch redirect modes', () => {
  it.each(['manual', 'error'])('honors the %s redirect mode before sending a second request', async (redirect) => {
    const response = new Response('redirect', {
      status: 302,
      headers: { location: 'https://93.184.215.15/private' },
    });
    const fetch = vi.fn(async () => response);

    vi.stubGlobal('fetch', fetch);

    const request = publicFetch('https://93.184.215.14/robot.urdf', { redirect });

    if (redirect === 'manual') expect(await request).toBe(response);
    else await expect(request).rejects.toThrow('Redirects aren’t allowed.');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].redirect).toBe('manual');
  });
});

const v6 = (...groups) => groups.join(':');

describe('public fetch IPv6 destinations', () => {
  it.each([
    v6('', '', '7f00', '1'),
    v6('', '', '127.0.0.1'),
    v6('2002', '7f00', '1', '', ''),
    v6('2002', 'c0a8', '101', '', ''),
    v6('64', 'ff9b', '', '7f00', '1'),
    v6('64', 'ff9b', '1', '', '7f00', '1'),
    v6('2001', '0', '4136', 'e378', '8000', '63bf', '3fff', 'fdd2'),
    v6('2001', '0', '4136', 'e378', '8000', '63bf', '80ff', 'fffe'),
    v6('fec0', '', '1'),
    v6('feff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff'),
    v6('2001', 'db8', '', '1'),
    v6('100', '', '1'),
    v6('100', '0', '0', '1', '', '1'),
    v6('100', '0', '0', '1', 'ffff', 'ffff', 'ffff', 'ffff'),
    v6('2001', '2', '', '1'),
    v6('2001', '2', '0', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff'),
    v6('3fff', '', '1'),
    v6('3fff', 'fff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff'),
    v6('5f00', '', '1'),
    v6('5f00', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff', 'ffff'),
    v6('', '', 'ffff', '0', '7f00', '1'),
    v6('', '', 'ffff', '7f00', '1'),
    v6('0', '0', '0', '0', '0', 'ffff', '127.0.0.1'),
  ])('refuses nonpublic IPv6 %s before making a request', async (address) => {
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);
    expect(isPublicAddress(address), address).toBe(false);
    await expect(publicFetch(`http://[${address}]/`)).rejects.toThrow('public');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    v6('2606', '4700', '4700', '', '1111'),
    v6('2002', '5db8', 'd70e', '', ''),
    v6('2001', '0', '4136', 'e378', '8000', '63bf', 'a247', '28f1'),
    v6('', '', 'ffff', [93, 184, 215, 14].join('.')),
    v6('', '', 'ffff', '5db8', 'd70e'),
  ])('allows public IPv6 %s', async (address) => {
    expect(isPublicAddress(address), address).toBe(true);
    await expect(assertPublicUrl(`https://[${address}]/`)).resolves.toBeUndefined();
  });

  it('refuses nonpublic IPv6 among otherwise public DNS answers before fetching', async () => {
    const fetch = vi.fn();
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: [93, 184, 215, 14].join('.'), family: 4 },
      { address: v6('2002', '7f00', '1', '', ''), family: 6 },
    ]);

    vi.stubGlobal('fetch', fetch);
    await expect(publicFetch('https://example.com/model')).rejects.toThrow('public');
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a redirect to nonpublic IPv6 before sending another request', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://[5f00::1]/' } }));

    vi.stubGlobal('fetch', fetch);
    await expect(publicFetch('https://93.184.215.14/model')).rejects.toThrow('public');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses scoped IPv6 literals', async () => {
    const address = v6('fe80', '', '1%en0');
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);
    expect(isPublicAddress(address)).toBe(false);
    await expect(publicFetch(`http://[${address}]/`)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
