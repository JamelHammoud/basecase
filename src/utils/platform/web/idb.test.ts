import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeDb {
  close: ReturnType<typeof vi.fn>;
  onversionchange: (() => void) | null;
  objectStoreNames: { contains: () => boolean };
  transaction: () => { objectStore: () => { get: () => FakeRequest } };
}

interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
  onupgradeneeded: (() => void) | null;
}

const request = (): FakeRequest => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null,
  onblocked: null,
  onupgradeneeded: null,
});

function fakeDb(): FakeDb {
  return {
    close: vi.fn(),
    onversionchange: null,
    objectStoreNames: { contains: () => true },
    transaction: () => ({
      objectStore: () => {
        const get = request();

        setTimeout(() => {
          get.result = 'stored';
          get.onsuccess?.();
        }, 0);

        return { get: () => get };
      },
    }),
  };
}

let opens: FakeRequest[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  opens = [];
  vi.resetModules();
  vi.stubGlobal('indexedDB', {
    open: () => {
      const open = request();

      opens.push(open);

      return open;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('the web database', () => {
  it('fails a blocked upgrade instead of waiting for the older tab forever', async () => {
    const { idbGet } = await import('./idb');
    const read = idbGet('settings', 'purchases');

    await settle();
    opens[0].onblocked?.();

    await expect(read).rejects.toThrow('Close Basecase’s other tabs, then reload this one.');
  });

  it('gives way to a newer version and reopens on the next call', async () => {
    const { idbGet } = await import('./idb');
    const first = fakeDb();
    const read = idbGet('settings', 'purchases');

    await settle();
    opens[0].result = first;
    opens[0].onsuccess?.();
    await expect(read).resolves.toBe('stored');

    first.onversionchange?.();
    expect(first.close).toHaveBeenCalledOnce();

    const again = idbGet('settings', 'purchases');

    await settle();
    expect(opens).toHaveLength(2);
    opens[1].result = fakeDb();
    opens[1].onsuccess?.();
    await expect(again).resolves.toBe('stored');
  });
});
