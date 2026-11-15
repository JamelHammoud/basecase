import { refuse } from '../validate';
import type { ImportedMeshWorld, WorldImportFile } from '../worldImportTypes';
import { integer, MAX_WORLD_BYTES, MAX_WORLD_SPLATS } from './limits';
import { validateZstd } from './zstd';
import { readPly } from './ply';

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
  const degree = bytes[12];

  if (degree > 3) return refuse('SPZ', 'needs spherical harmonic degree 0–3');

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

export async function readSplat(file: WorldImportFile): Promise<NonNullable<ImportedMeshWorld['splat']>> {
  const format = file.name.toLowerCase().endsWith('.spz') ? 'spz' : 'ply';
  const result =
    format === 'spz' ? { count: await spzCount(file.bytes), bytes: file.bytes.slice() } : readPly(file.bytes);

  return { name: file.name, format, ...result };
}
