import { Decompress } from 'fzstd';
import { refuse } from '../validate';
import { MAX_WORLD_BYTES } from './limits';

function frameStart(bytes: Uint8Array, expected: number): number {
  if (bytes.length < 6) return refuse('SPZ', 'has a truncated ZSTD header');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const descriptor = bytes[4];
  const single = (descriptor & 32) !== 0;
  const sizeFlag = descriptor >> 6;
  const dictionaryBytes = [0, 1, 2, 4][descriptor & 3];
  const sizeBytes = sizeFlag ? 2 ** sizeFlag : Number(single);
  const offset = 5 + Number(!single) + dictionaryBytes;

  if (view.getUint32(0, true) !== 0xfd2fb528 || descriptor & 24 || dictionaryBytes || offset + sizeBytes > bytes.length)
    return refuse('SPZ', 'has an unsupported ZSTD frame');

  const window = single ? expected : 2 ** (10 + (bytes[5] >> 3)) * (1 + (bytes[5] & 7) / 8);

  if (window > MAX_WORLD_BYTES) return refuse('SPZ', 'has an oversized ZSTD window');

  let content = 0;

  for (let i = 0; i < sizeBytes; i++) content += bytes[offset + i] * 256 ** i;

  if (sizeFlag === 1) content += 256;

  if (!sizeBytes || content !== expected) return refuse('SPZ', 'has a mismatched ZSTD stream size');

  return offset + sizeBytes;
}

function validateFrame(bytes: Uint8Array, expected: number) {
  let offset = frameStart(bytes, expected);
  let final = false;

  while (!final) {
    if (offset + 3 > bytes.length) return refuse('SPZ', 'has a truncated ZSTD block');

    const block = bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    const type = (block >> 1) & 3;
    const size = block >> 3;

    if (type === 3 || size > 131072) return refuse('SPZ', 'has an unsupported ZSTD block');

    final = (block & 1) === 1;
    offset += 3 + (type === 1 ? 1 : size);
  }

  if (offset + (bytes[4] & 4 ? 4 : 0) !== bytes.length) return refuse('SPZ', 'has truncated or repeated ZSTD frames');
}

export function validateZstd(bytes: Uint8Array, expected: number) {
  validateFrame(bytes, expected);

  let count = 0;
  const decoder = new Decompress((chunk) => {
    count += chunk.length;

    if (count > expected) return refuse('SPZ', 'has an oversized ZSTD payload');
  });

  decoder.push(bytes, true);

  if (count !== expected) return refuse('SPZ', 'has a truncated ZSTD payload');
}
