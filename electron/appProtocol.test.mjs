import { describe, expect, it, vi } from 'vitest';
import { serveApp } from './appProtocol.mjs';

const installed = vi.hoisted(() => ({ handle: null }));

vi.mock('electron', () => ({
  protocol: {
    handle: (_scheme, handle) => {
      installed.handle = handle;
    },
  },
  net: { fetch: vi.fn() },
}));

describe('app binary assets', () => {
  it('serves assets through the app origin with isolation headers', async () => {
    const asset = vi.fn(
      () => new Response(new Uint8Array([2, 3]), { status: 206, headers: { 'content-range': 'bytes 2-3/8' } }),
    );

    serveApp({ asset });

    const response = await installed.handle(new Request('app://basecase/api/try-video?id=clip'));

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-3/8');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3]);
  });

  it('refuses a crafted app host before accessing its asset', async () => {
    const asset = vi.fn();

    serveApp({ asset });

    const response = await installed.handle(new Request('app://basecase.evil/api/try-video?id=clip'));

    expect(response.status).toBe(403);
    expect(asset).not.toHaveBeenCalled();
  });
});
