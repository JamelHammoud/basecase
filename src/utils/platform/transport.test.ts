import { afterEach, describe, expect, it, vi } from 'vitest';
import { platformBridge } from '../platformBridge';
import { electron } from './transport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('platform transport in workers', () => {
  it('reads sourced mesh bytes through the existing HTTP route without window', async () => {
    vi.stubGlobal('window', undefined);

    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: 'AAEC//4=' }));
    const bytes = await platformBridge.sourcedMesh('sourced-servo');

    expect(electron()).toBeUndefined();
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(bytes!)]).toEqual([0, 1, 2, 255, 254]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/bridge/sourced-mesh?id=sourced-servo', undefined);
  });

  it('keeps renderer mesh reads on the preload API when it is present', async () => {
    const sourcedMesh = vi.fn().mockResolvedValue([0, 1, 2, 255, 254]);
    const api = { sourcedMesh };

    vi.stubGlobal('window', { electronAPI: api });

    const fetch = vi.spyOn(globalThis, 'fetch');
    const bytes = await platformBridge.sourcedMesh('sourced-servo');

    expect(electron()).toBe(api);
    expect([...new Uint8Array(bytes!)]).toEqual([0, 1, 2, 255, 254]);
    expect(sourcedMesh).toHaveBeenCalledExactlyOnceWith('sourced-servo');
    expect(fetch).not.toHaveBeenCalled();
  });
});
