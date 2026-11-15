import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

const encoder = Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toBase64')!;
const decoder = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64')!;

afterEach(() => {
  Object.defineProperty(Uint8Array.prototype, 'toBase64', encoder);
  Object.defineProperty(Uint8Array, 'fromBase64', decoder);
  vi.unstubAllGlobals();
});

describe.each(['native', 'fallback'])('base64 %s conversion', (mode) => {
  function selectMode() {
    if (mode === 'native') return;

    Object.defineProperty(Uint8Array.prototype, 'toBase64', { value: undefined, configurable: true });
    Object.defineProperty(Uint8Array, 'fromBase64', { value: undefined, configurable: true });
  }

  it('preserves every byte, padding and chunk boundary', () => {
    selectMode();

    for (const length of [0, 1, 2, 3, 255, 256, 32767, 32768, 32769, 100001]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i % 256);
      const encoded = Buffer.from(bytes).toString('base64');

      expect(bytesToBase64(bytes)).toBe(encoded);
      expect(base64ToBytes(encoded)).toEqual(bytes);
    }
  });

  it('encodes only the selected view and returns an exact owned decode buffer', () => {
    selectMode();

    const source = new Uint8Array([99, 0, 128, 255, 88]);
    const view = source.subarray(1, 4);
    const encoded = bytesToBase64(view);
    const decoded = base64ToBytes(encoded);

    expect(encoded).toBe('AID/');
    expect(decoded).toEqual(view);
    expect(decoded.byteOffset).toBe(0);
    expect(decoded.buffer.byteLength).toBe(3);
    decoded[0] = 42;
    expect(source[1]).toBe(0);
  });

  it.each(['', ' \t\n\r\f', 'Zg', 'Zg==', 'Zh==', 'Zm8', 'Zm9=', ' Z m\t9\nv\r\f', '+/8='])(
    'keeps atob acceptance and bytes for %j',
    (text) => {
      selectMode();

      expect(base64ToBytes(text)).toEqual(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));
    },
  );

  it.each(['A', 'A=', 'A===', '=', '====', 'Zg=', 'Zg===', 'Z=g=', 'Zg==A', '-_8=', 'Zg==!', 'Zg\u00a0=='])(
    'rejects malformed input %j',
    (text) => {
      selectMode();

      expect(() => base64ToBytes(text)).toThrow();
    },
  );
});

it('uses native conversion without making a binary string', () => {
  vi.stubGlobal('btoa', () => {
    throw new Error('Binary string encoding called');
  });
  vi.stubGlobal('atob', () => {
    throw new Error('Binary string decoding called');
  });

  const bytes = new Uint8Array([0, 128, 255]);

  expect(bytesToBase64(bytes)).toBe('AID/');
  expect(base64ToBytes('AID/')).toEqual(bytes);
});
