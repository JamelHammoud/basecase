import { describe, expect, it } from 'vitest';
import { lz4Block, lz4Frame } from './lz4';
import { lz4FrameStored } from './mcapFixtures';
import { MCAP_DAMAGED } from './ros2Cdr';
import { DataImportError } from './types';

const LINKED_WITH_CHECKSUMS = [
  'BCJNGFxA8EkCAAAAAADpbAEAAP9SbE50khMlIi4xoc0TvhLtQmlmziT8I9fajSCXYWoGlW7CitQDE2go1FcePF3ubl7ASpERX107',
  'UT7CU6QWrW7lOJQR0Ciao0z1wDR8WcrwhJXzYRsLUGjVmAT5LrcpmVVXeWEA////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '/4dQwlOkFq0Sox7XCgEAAA/D////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '///////////////////////////////////////////////////////////////////oUPwj19qN0UPlt1QAAAAPYQD/////////',
  '/////////////////////////////////////////////////////////////////////////////////////////yJQitQDE2hE',
  '2Y/eAAAAAH36qlw=',
].join('');

const INDEPENDENT = [
  'BCJNGGRAp2wBAAD/UmxOdJITJSIuMaHNE74S7UJpZs4k/CPX2o0gl2FqBpVuworUAxNoKNRXHjxd7m5ewEqREV9dO1E+wlOkFq1u',
  '5TiUEdAomqNM9cA0fFnK8ISV82EbC1Bo1ZgE+S63KZlVV3lhAP//////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '//////////////////////////////////////////////////////////////////////////////////////////+HUMJTpBat',
  'bAEAAP9SbuU4lBHQKJqjTPXANHxZyvCElfNhGwtQaNWYBPkutymZVVd5bE50khMlIi4xoc0TvhLtQmlmziT8I9fajSCXYWoGlW7C',
  'itQDE2go1FcePF3ubl7ASpERX107UT7CU6QWrWEA////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '////////////////////////////////////////////////////////////////////////////////////////////////////',
  '/////////////////////////////////////////////////////////////////////////////////4dQ/CPX2o21AAAA/1Ig',
  'l2FqBpVuworUAxNoKNRXHjxd7m5ewEqREV9dO1E+wlOkFq1u5TiUEdAomqNM9cA0fFnK8ISV82EbC1Bo1ZgE+S63KZlVV3lsTnSS',
  'EyUiLjGhzRO+Eu1CaWbOJPwj19qNYQD/////////////////////////////////////////////////////////////////////',
  '////////////////////////////wFCK1AMTaAAAAAB9+qpc',
].join('');

const MAGIC = [0x04, 0x22, 0x4d, 0x18];
const LINKED = 0x40;
const INDEPENDENT_BLOCKS = 0x60;
const BLOCKS_64K = 0x40;

const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

const word = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];

interface Block {
  bytes: number[];
  stored?: boolean;
}

function frame(blocks: Block[], options: { flags?: number; descriptor?: number } = {}) {
  const header = [...MAGIC, options.flags ?? INDEPENDENT_BLOCKS, options.descriptor ?? BLOCKS_64K, 0];
  const body = blocks.flatMap((block) => [
    ...word((block.bytes.length | (block.stored ? 0x80000000 : 0)) >>> 0),
    ...block.bytes,
  ]);

  return Uint8Array.from([...header, ...body, ...word(0)]);
}

function pattern(length: number) {
  const period = new Uint8Array(97);
  let x = 7;

  for (let i = 0; i < period.length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    period[i] = (x >>> 16) & 0xff;
  }

  return Uint8Array.from({ length }, (_, i) => period[i % period.length]);
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

function expectDamaged(run: () => unknown) {
  const error = (() => {
    try {
      run();
    } catch (caught) {
      return caught;
    }

    return null;
  })();

  expect(error).toBeInstanceOf(DataImportError);
  expect((error as Error).message).toBe(MCAP_DAMAGED);
}

const OVERLAPPING = [0x38, ...ascii('abc'), 0x03, 0x00, 0x30, ...ascii('xyz')];
const DISTANT = [0xd7, ...ascii('hello world, '), 0x0d, 0x00, 0x10, ...ascii('!')];
const LONG_RUNS = [0xff, 5, ...ascii('abcdefghijklmnopqrst'), 0x01, 0x00, 255, 26, 0x10, ...ascii('.')];

describe('lz4Frame', () => {
  it('copies matches, overlapping ones included', () => {
    expect(text(lz4Frame(frame([{ bytes: OVERLAPPING }]), 18))).toBe('abcabcabcabcabcxyz');
    expect(text(lz4Frame(frame([{ bytes: DISTANT }]), 25))).toBe('hello world, hello world!');
  });

  it('reads extended literal and match lengths', () => {
    const out = text(lz4Frame(frame([{ bytes: LONG_RUNS }]), 321));

    expect(out).toBe(`abcdefghijklmnopqrst${'t'.repeat(300)}.`);
  });

  it('reads frames the lz4 tool wrote, linked with checksums and independent', () => {
    const expected = pattern(150_000);

    expect(lz4Frame(fromBase64(LINKED_WITH_CHECKSUMS), expected.length)).toEqual(expected);
    expect(lz4Frame(fromBase64(INDEPENDENT), expected.length)).toEqual(expected);
  });

  it.each([0, 5, 64 * 1024, 200_000])('reads back stored frames of %i bytes', (length) => {
    const data = pattern(length);

    expect(lz4Frame(lz4FrameStored(data), length)).toEqual(data);
  });

  it('reads concatenated frames and skips skippable ones', () => {
    const skippable = [0x50, 0x2a, 0x4d, 0x18, ...word(3), 1, 2, 3];
    const input = Uint8Array.from([...frame([{ bytes: OVERLAPPING }]), ...skippable, ...lz4FrameStored(pattern(10))]);

    expect(text(lz4Frame(input, 28).subarray(0, 18))).toBe('abcabcabcabcabcxyz');
  });

  it('lets a linked block reach into the block before it, never an independent one', () => {
    const blocks = [{ bytes: ascii('abcd'), stored: true }, { bytes: [0x00, 0x04, 0x00] }];

    expect(text(lz4Frame(frame(blocks, { flags: LINKED }), 8))).toBe('abcdabcd');
    expectDamaged(() => lz4Frame(frame(blocks), 8));
  });

  it('refuses a match reaching before the start of its output, or a zero offset', () => {
    expectDamaged(() => lz4Frame(frame([{ bytes: [0x10, ...ascii('a'), 0x05, 0x00] }]), 5));
    expectDamaged(() => lz4Frame(frame([{ bytes: [0x10, ...ascii('a'), 0x00, 0x00] }]), 5));
  });

  it('refuses output past the declared size or short of it', () => {
    expectDamaged(() => lz4Frame(frame([{ bytes: OVERLAPPING }]), 17));
    expectDamaged(() => lz4Frame(lz4FrameStored(pattern(100)), 99));
    expectDamaged(() => lz4Frame(frame([{ bytes: OVERLAPPING }]), 19));
  });

  it('refuses malformed frames', () => {
    const good = frame([{ bytes: OVERLAPPING }]);
    const withByte = (at: number, value: number) => Uint8Array.from(good, (byte, i) => (i === at ? value : byte));

    expectDamaged(() => lz4Frame(new Uint8Array(), 0));
    expectDamaged(() => lz4Frame(withByte(0, 0x05), 18));
    expectDamaged(() => lz4Frame(withByte(4, INDEPENDENT_BLOCKS | 0x01), 18));
    expectDamaged(() => lz4Frame(withByte(4, 0x80 | 0x20), 18));
    expectDamaged(() => lz4Frame(withByte(5, 0x30), 18));
    expectDamaged(() => lz4Frame(good.subarray(0, good.length - 4), 18));
    expectDamaged(() => lz4Frame(good.subarray(0, 12), 18));
    expectDamaged(() => lz4Frame(frame([{ bytes: new Array(64 * 1024 + 1).fill(0), stored: true }]), 64 * 1024 + 1));
    expectDamaged(() => lz4Frame(fromBase64(LINKED_WITH_CHECKSUMS), 150_001));
  });
});

describe('lz4Block', () => {
  it('reads a raw block into exactly its size', () => {
    expect(text(lz4Block(Uint8Array.from(OVERLAPPING), 18))).toBe('abcabcabcabcabcxyz');
    expectDamaged(() => lz4Block(Uint8Array.from(OVERLAPPING), 20));
    expectDamaged(() => lz4Block(Uint8Array.from(OVERLAPPING.slice(0, 5)), 18));
  });
});
