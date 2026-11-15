import { describe, expect, it } from 'vitest';
import { splatPly } from './fixtures';
import { readPly } from './ply';

function binaryPly(type: string, size: number) {
  const text = new TextDecoder().decode(splatPly().bytes);
  const header = new TextEncoder().encode(
    text
      .slice(0, text.indexOf('end_header') + 'end_header\n'.length)
      .replace('format ascii', 'format binary_little_endian')
      .replaceAll('property float ', `property ${type} `),
  );
  const payload = new Uint8Array(size * 14);
  const bytes = new Uint8Array(header.length + payload.length);

  bytes.set(header);
  bytes.set(payload, header.length);

  return bytes;
}

function splitPly(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  const offset = text.indexOf('end_header\n') + 'end_header\n'.length;

  return {
    header: text.slice(0, offset),
    payload: bytes.subarray(offset),
    view: new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset),
  };
}

describe('PLY normalization for Spark', () => {
  it('encodes all ASCII vertex records into little-endian properties without changing their values', () => {
    const first = new TextDecoder().decode(splatPly('1.25').bytes);
    const text = first.replace('element vertex 1', 'element vertex 2') + '-2.5 3 4 5 -1 -2 -3 1 0 0 0 0.1 0.2 0.3\n';
    const { bytes, count } = readPly(new TextEncoder().encode(text));
    const { header, view, payload } = splitPly(bytes);

    expect(count).toBe(2);
    expect(header).toContain('format binary_little_endian 1.0');
    expect(header).not.toContain('format ascii');
    expect(payload).toHaveLength(2 * 14 * 4);
    expect(Array.from({ length: 28 }, (_, i) => view.getFloat32(i * 4, true))).toEqual([
      1.25,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      -2.5,
      3,
      4,
      5,
      -1,
      -2,
      -3,
      1,
      0,
      0,
      0,
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
    ]);
    expect(readPly(bytes).bytes).toEqual(bytes);
  });

  it.each([
    ['float32', 'float', 4],
    ['float64', 'double', 8],
    ['uint8', 'uchar', 1],
  ] as const)('rewrites the %s binary property alias Spark does not decode', (alias, canonical, size) => {
    const source = binaryPly(alias, size);
    const { bytes, count } = readPly(source);
    const { header, payload } = splitPly(bytes);

    expect(count).toBe(1);
    expect(header).toContain(`property ${canonical} x\n`);
    expect(header).not.toContain(`property ${alias} `);
    expect(payload).toEqual(splitPly(source).payload);
  });

  it('preserves canonical binary PLY without copying its values through text', () => {
    const source = binaryPly('double', 8);
    const { view } = splitPly(source);

    view.setFloat64(0, 1.23456789012345, true);
    expect(readPly(source).bytes).toEqual(source);
  });

  it.each(['f_dc_0', 'f_dc_1', 'f_dc_2'])('refuses Gaussian records missing the %s color required by Spark', (name) => {
    const source = new TextDecoder().decode(splatPly().bytes).replace(`property float ${name}\n`, '');

    expect(() => readPly(new TextEncoder().encode(source))).toThrow('Gaussian splat properties');
  });

  it('refuses finite ASCII values that overflow their declared float or byte representation', () => {
    const float = splatPly('1e100').bytes;
    const byte = new TextEncoder().encode(
      new TextDecoder().decode(splatPly('256').bytes).replace('property float x', 'property uchar x'),
    );

    expect(() => readPly(float)).toThrow('nonfinite');
    expect(() => readPly(byte)).toThrow('byte');
  });

  it('bounds the binary output before expanding compact ASCII properties', () => {
    const source = new TextDecoder()
      .decode(splatPly('0', 1_000_000).bytes)
      .replaceAll('property float ', 'property double ');

    expect(() => readPly(new TextEncoder().encode(source))).toThrow('64 MB');
  });
});
