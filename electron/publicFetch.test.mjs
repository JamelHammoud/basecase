import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicFetch } from './publicFetch.mjs';

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
