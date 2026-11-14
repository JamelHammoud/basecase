export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
export const readJson = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

export function depthBytes(depth: Float32Array): Uint8Array {
  const bytes = new Uint8Array(depth.length * 4);
  const view = new DataView(bytes.buffer);

  depth.forEach((v, i) => view.setFloat32(i * 4, v, true));

  return bytes;
}

export function readDepth(bytes: Uint8Array): Float32Array {
  if (bytes.length > 67_108_864 || bytes.length % 4) throw new Error('Check the depth image size.');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return Float32Array.from({ length: bytes.length / 4 }, (_, i) => view.getFloat32(i * 4, true));
}

export function byteChecksum(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;

  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;

  return hash.toString(16).padStart(8, '0');
}
