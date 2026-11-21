import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isPublicAddress, publicFetch } from './publicFetch.mjs';

afterEach(() => vi.unstubAllGlobals());

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
});
