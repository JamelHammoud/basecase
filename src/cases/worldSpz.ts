import { CaseFileError } from './validate';
import type { DroppedFile } from './worldTypes';
import { damaged, MAX_SPLAT_POINTS, withCommas, worldRefuse } from './worldRead';

export const SPZ_MAGIC = 0x5053474e;
export const SPZ_HEADER_BYTES = 16;
export const SPZ_VERSIONS = [2, 3];

const SH_COEFFICIENTS = [0, 3, 8, 15];
const POSITION_BYTES = 9;
const ALPHA_BYTES = 1;
const COLOR_BYTES = 3;
const SCALE_BYTES = 3;
const MAX_FRACTIONAL_BITS = 24;

export interface SpzHeader {
  version: number;
  points: number;
  shDegree: number;
  fractionalBits: number;
}

export function spzHeader(head: Uint8Array, name: string): SpzHeader {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);

  if (head.byteLength < SPZ_HEADER_BYTES || view.getUint32(0, true) !== SPZ_MAGIC) damaged(name);

  const header = {
    version: view.getUint32(4, true),
    points: view.getUint32(8, true),
    shDegree: view.getUint8(12),
    fractionalBits: view.getUint8(13),
  };

  if (!SPZ_VERSIONS.includes(header.version)) worldRefuse(`${name} is a splat version Basecase can’t read.`);

  if (header.shDegree >= SH_COEFFICIENTS.length || header.fractionalBits > MAX_FRACTIONAL_BITS) damaged(name);

  if (header.points > MAX_SPLAT_POINTS) worldRefuse(`${name} has over ${withCommas(MAX_SPLAT_POINTS)} points.`);

  return header;
}

export function spzLength({ version, points, shDegree }: SpzHeader): number {
  const rotation = version === 3 ? 4 : 3;
  const perPoint = POSITION_BYTES + ALPHA_BYTES + COLOR_BYTES + SCALE_BYTES + rotation + SH_COEFFICIENTS[shDegree] * 3;

  return SPZ_HEADER_BYTES + points * perPoint;
}

interface Inflating {
  bytes: Uint8Array;
  name: string;
  lengthOf: (head: Uint8Array) => number;
}

async function inflatedLength({ bytes, name, lengthOf }: Inflating): Promise<number> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const head = new Uint8Array(SPZ_HEADER_BYTES);
  let got = 0;
  let want = Infinity;

  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      if (got < SPZ_HEADER_BYTES) head.set(chunk.value.subarray(0, SPZ_HEADER_BYTES - got), got);

      got += chunk.value.byteLength;

      if (want === Infinity && got >= SPZ_HEADER_BYTES) want = lengthOf(head);

      if (got > want) worldRefuse(`${name} holds more than its points.`);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }

  return got;
}

export async function inflateSpz(bytes: Uint8Array, name: string): Promise<SpzHeader> {
  let header: SpzHeader | undefined;

  const lengthOf = (head: Uint8Array) => {
    header = spzHeader(head, name);

    return spzLength(header);
  };

  const got = await inflatedLength({ bytes, name, lengthOf }).catch((error: unknown) =>
    error instanceof CaseFileError ? Promise.reject(error) : damaged(name),
  );

  if (!header || got !== spzLength(header)) damaged(name);

  return header!;
}

export async function readSpz(file: DroppedFile): Promise<number> {
  return (await inflateSpz(file.bytes, file.name)).points;
}
