import { refuse } from '../validate';
import { integer, MAX_WORLD_BYTES, MAX_WORLD_SPLATS } from './limits';

interface PlyProperty {
  name: string;
  type: string;
  size: number;
  read: (view: DataView, offset: number) => number;
  write: (view: DataView, offset: number, value: number) => void;
}

const FLOAT = {
  type: 'float',
  size: 4,
  read: (v: DataView, o: number) => v.getFloat32(o, true),
  write: (v: DataView, o: number, n: number) => v.setFloat32(o, n, true),
};
const DOUBLE = {
  type: 'double',
  size: 8,
  read: (v: DataView, o: number) => v.getFloat64(o, true),
  write: (v: DataView, o: number, n: number) => v.setFloat64(o, n, true),
};
const BYTE = {
  type: 'uchar',
  size: 1,
  read: (v: DataView, o: number) => v.getUint8(o),
  write: (v: DataView, o: number, n: number) => v.setUint8(o, n),
};
const PLY_TYPES: Record<string, Omit<PlyProperty, 'name'>> = {
  float: FLOAT,
  float32: FLOAT,
  double: DOUBLE,
  float64: DOUBLE,
  uchar: BYTE,
  uint8: BYTE,
};

function plyHeader(bytes: Uint8Array) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 16384));
  const match = /end_header\r?\n/.exec(prefix);

  if (!prefix.startsWith('ply\n') && !prefix.startsWith('ply\r\n')) return refuse('PLY', 'needs a PLY header');

  if (!match) return refuse('PLY', 'has an oversized or truncated header');

  const header = prefix.slice(0, match.index);
  const countMatch = /^element vertex (\d+)\r?$/m.exec(header);
  const count = integer(Number(countMatch?.[1]), MAX_WORLD_SPLATS);
  const properties = [...header.matchAll(/^property (\w+) (\w+)\r?$/gm)].map((match) => {
    const type = PLY_TYPES[match[1]];

    return type ? { name: match[2], ...type } : refuse('PLY', 'has an unsupported property type');
  });

  if (
    !count ||
    properties.length > 128 ||
    /^property list /m.test(header) ||
    [...header.matchAll(/^element /gm)].length !== 1 ||
    ![
      'x',
      'y',
      'z',
      'opacity',
      'scale_0',
      'scale_1',
      'scale_2',
      'rot_0',
      'rot_1',
      'rot_2',
      'rot_3',
      'f_dc_0',
      'f_dc_1',
      'f_dc_2',
    ].every((name) => properties.some((p) => p.name === name))
  )
    return refuse('PLY', 'needs Gaussian splat properties');

  return {
    header,
    count,
    properties,
    offset: new TextEncoder().encode(prefix.slice(0, match.index + match[0].length)).length,
  };
}

function binaryPayload(bytes: Uint8Array, meta: ReturnType<typeof plyHeader>, size: number): Uint8Array {
  if (meta.offset + size !== bytes.length) return refuse('PLY', 'has a truncated payload');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = meta.offset;

  for (let i = 0; i < meta.count * meta.properties.length; i++) {
    const property = meta.properties[i % meta.properties.length];

    if (!Number.isFinite(property.read(view, cursor))) return refuse('PLY', 'has nonfinite properties');

    cursor += property.size;
  }

  return bytes.subarray(meta.offset);
}

function asciiPayload(bytes: Uint8Array, meta: ReturnType<typeof plyHeader>, size: number): Uint8Array {
  const text = new TextDecoder().decode(bytes.subarray(meta.offset));
  const payload = new Uint8Array(size);
  const view = new DataView(payload.buffer);
  const tokens = /\S+/g;
  const expected = meta.count * meta.properties.length;
  let count = 0;
  let offset = 0;
  let token = tokens.exec(text);

  while (token !== null) {
    const value = Number(token[0]);

    if (count >= expected || !Number.isFinite(value)) return refuse('PLY', 'has excess or nonfinite properties');

    const property = meta.properties[count % meta.properties.length];

    if (property.type === 'uchar' && (!Number.isInteger(value) || value < 0 || value > 255))
      return refuse('PLY', 'has an out-of-range byte property');

    property.write(view, offset, value);

    if (!Number.isFinite(property.read(view, offset))) return refuse('PLY', 'has nonfinite properties');

    offset += property.size;
    count++;
    token = tokens.exec(text);
  }

  if (count !== expected) return refuse('PLY', 'has truncated properties');

  return payload;
}

export function readPly(bytes: Uint8Array): { bytes: Uint8Array; count: number } {
  const meta = plyHeader(bytes);
  const size = meta.count * meta.properties.reduce((sum, p) => sum + p.size, 0);
  const header = new TextEncoder().encode(
    meta.header
      .replace(/^format ascii 1\.0\r?$/m, 'format binary_little_endian 1.0')
      .replace(
        /^property (\w+) (\w+)\r?$/gm,
        (_, type: string, name: string) => `property ${PLY_TYPES[type].type} ${name}`,
      ) + 'end_header\n',
  );

  if (size + header.length > MAX_WORLD_BYTES) return refuse('PLY', 'expands beyond 64 MB');

  const ascii = /^format ascii 1\.0\r?$/m.test(meta.header);

  if (!ascii && !/^format binary_little_endian 1\.0\r?$/m.test(meta.header))
    return refuse('PLY', 'needs ASCII or little-endian data');

  const payload = ascii ? asciiPayload(bytes, meta, size) : binaryPayload(bytes, meta, size);
  const normalized = new Uint8Array(header.length + payload.length);

  normalized.set(header);
  normalized.set(payload, header.length);

  return { bytes: normalized, count: meta.count };
}
