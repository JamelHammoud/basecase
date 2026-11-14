import { refuse } from '../validate';
import type { ImportedMeshWorld, WorldImportFile } from '../worldImportTypes';
import { integer, MAX_WORLD_BYTES, MAX_WORLD_SPLATS } from './limits';
import { validateZstd } from './zstd';

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) break;

    size += chunk.value.length;

    if (size > MAX_WORLD_BYTES) {
      await reader.cancel();

      return refuse('SPZ', 'expands beyond 64 MB');
    }

    chunks.push(chunk.value);
  }

  const out = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function spzHeader(bytes: Uint8Array): { view: DataView; version: number; count: number; degree: number } {
  if (bytes.length < 16) return refuse('SPZ', 'has a truncated header');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const count = integer(view.getUint32(8, true), MAX_WORLD_SPLATS);
  const degree = integer(bytes[12], 4);

  if (view.getUint32(0, true) !== 0x5053474e || !count || ![1, 2, 3, 4].includes(version) || bytes[13] > 24)
    return refuse('SPZ', 'has an unsupported header');

  return { view, version, count, degree };
}

function v4Count(bytes: Uint8Array): number {
  const { view, version, count, degree } = spzHeader(bytes);

  if (
    version !== 4 ||
    bytes.length < 32 ||
    bytes[14] & ~1 ||
    bytes[15] !== (degree ? 6 : 5) ||
    bytes.subarray(20, 32).some((n) => n !== 0)
  )
    return refuse('SPZ', 'has an unsupported version 4 header');

  const offset = view.getUint32(16, true);
  const streams = bytes[15];

  if (offset !== 32 || offset + streams * 16 > bytes.length) return refuse('SPZ', 'has a truncated stream table');

  let compressed = offset + streams * 16;
  let expanded = 0;
  const expectedSizes = [count * 9, count, count * 3, count * 3, count * 4, count * [0, 9, 24, 45, 72][degree]];

  for (let i = 0; i < streams; i++) {
    const size = integer(Number(view.getBigUint64(offset + i * 16, true)));
    const uncompressed = integer(Number(view.getBigUint64(offset + i * 16 + 8, true)));

    if (uncompressed !== expectedSizes[i] || compressed + size > bytes.length)
      return refuse('SPZ', 'has a mismatched stream size');

    validateZstd(bytes.subarray(compressed, compressed + size), uncompressed);
    compressed += size;
    expanded += uncompressed;
  }

  if (compressed !== bytes.length || expanded > MAX_WORLD_BYTES)
    return refuse('SPZ', 'has an oversized or truncated stream');

  return count;
}

async function spzCount(bytes: Uint8Array): Promise<number> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return v4Count(bytes);

  const expanded = await gunzip(bytes);
  const { version, count, degree } = spzHeader(expanded);
  const coefficients = [0, 9, 24, 45, 72][degree];
  const bytesPerPoint = (version === 1 ? 6 : 9) + 1 + 3 + 3 + (version === 3 ? 4 : 3) + coefficients;

  if (version === 4 || expanded[14] & ~1 || expanded[15] || expanded.length !== 16 + bytesPerPoint * count)
    return refuse('SPZ', 'has a truncated or unsupported payload');

  if (version === 1 && expanded.subarray(16, 16 + count * 6).some((value, i) => i % 2 === 1 && (value & 0x7c) === 0x7c))
    return refuse('SPZ', 'has nonfinite positions');

  return count;
}

interface PlyProperty {
  name: string;
  size: number;
  read: (view: DataView, offset: number) => number;
}

const PLY_TYPES: Record<string, Omit<PlyProperty, 'name'>> = {
  float: { size: 4, read: (v, o) => v.getFloat32(o, true) },
  float32: { size: 4, read: (v, o) => v.getFloat32(o, true) },
  double: { size: 8, read: (v, o) => v.getFloat64(o, true) },
  float64: { size: 8, read: (v, o) => v.getFloat64(o, true) },
  uchar: { size: 1, read: (v, o) => v.getUint8(o) },
  uint8: { size: 1, read: (v, o) => v.getUint8(o) },
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
    !['x', 'y', 'z', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'].every((name) =>
      properties.some((p) => p.name === name),
    )
  )
    return refuse('PLY', 'needs Gaussian splat properties');

  return {
    header,
    count,
    properties,
    offset: new TextEncoder().encode(prefix.slice(0, match.index + match[0].length)).length,
  };
}

function asciiPlyCount(bytes: Uint8Array, meta: ReturnType<typeof plyHeader>): number {
  const text = new TextDecoder().decode(bytes.subarray(meta.offset));
  const expected = meta.count * meta.properties.length;
  const tokens = /\S+/g;
  let count = 0;
  let token = tokens.exec(text);

  while (token !== null) {
    count++;

    if (count > expected || !Number.isFinite(Number(token[0])))
      return refuse('PLY', 'has excess or nonfinite properties');

    token = tokens.exec(text);
  }

  if (count !== expected) return refuse('PLY', 'has truncated properties');

  return meta.count;
}

function plyCount(bytes: Uint8Array): number {
  const { header, count, properties, offset } = plyHeader(bytes);

  if (/^format ascii 1\.0\r?$/m.test(header)) return asciiPlyCount(bytes, { header, count, properties, offset });

  if (!/^format binary_little_endian 1\.0\r?$/m.test(header)) return refuse('PLY', 'needs ASCII or little-endian data');

  const stride = properties.reduce((sum, p) => sum + p.size, 0);

  if (offset + count * stride !== bytes.length) return refuse('PLY', 'has a truncated payload');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = offset;

  for (let i = 0; i < count * properties.length; i++) {
    const property = properties[i % properties.length];

    if (!Number.isFinite(property.read(view, cursor))) return refuse('PLY', 'has nonfinite properties');

    cursor += property.size;
  }

  return count;
}

export async function readSplat(file: WorldImportFile): Promise<NonNullable<ImportedMeshWorld['splat']>> {
  const format = file.name.toLowerCase().endsWith('.spz') ? 'spz' : 'ply';
  const count = format === 'spz' ? await spzCount(file.bytes) : plyCount(file.bytes);

  return { name: file.name, bytes: file.bytes.slice(), format, count };
}
