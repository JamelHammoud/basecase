const MAGIC = 0x49534342;

export const SNAPSHOT_VERSION = 1;

export interface Snapshot<H> {
  header: H;
  blobs: Int8Array[];
}

export function encodeSnapshot<H>({ header, blobs }: Snapshot<H>): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ header, sizes: blobs.map((b) => b.length) }));
  const total = blobs.reduce((sum, b) => sum + b.length, 0);
  const bytes = new Uint8Array(12 + json.length + total);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, SNAPSHOT_VERSION, true);
  view.setUint32(8, json.length, true);
  bytes.set(json, 12);

  let at = 12 + json.length;

  for (const blob of blobs) {
    bytes.set(new Uint8Array(blob.buffer, blob.byteOffset, blob.length), at);
    at += blob.length;
  }

  return bytes;
}

export function decodeSnapshot<H>(bytes: Uint8Array): Snapshot<H> | null {
  if (bytes.length < 12) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);

  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== SNAPSHOT_VERSION) return null;

  if (12 + length > bytes.length) return null;

  const { header, sizes } = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length))) as {
    header: H;
    sizes: number[];
  };
  const blobs: Int8Array[] = [];
  let at = 12 + length;

  for (const size of sizes) {
    if (at + size > bytes.length) return null;

    blobs.push(new Int8Array(bytes.slice(at, at + size).buffer));
    at += size;
  }

  return { header, blobs };
}
