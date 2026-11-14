import { MAX_ENTRIES } from './archive';

const END_SIGNATURE = 0x06054b50;
const END_BYTES = 22;
const COMMENT_MAX = 0xffff;
const LOCATOR_SIGNATURE = 0x07064b50;
const LOCATOR_BYTES = 20;
const END64_SIGNATURE = 0x06064b50;
const END64_BYTES = 56;
const ENTRY_SIGNATURE = 0x02014b50;
const ENTRY_BYTES = 46;
const U32_MAX = 0xffffffff;

interface Directory {
  offset: number;
  size: number;
}

const view = async (blob: Blob, from: number, to: number) => new DataView(await blob.slice(from, to).arrayBuffer());

function endRecordAt(tail: DataView) {
  for (let at = tail.byteLength - END_BYTES; at >= 0; at--) {
    if (tail.getUint32(at, true) === END_SIGNATURE) return at;
  }

  return -1;
}

async function zip64Directory(blob: Blob, tail: DataView, end: number): Promise<Directory | null> {
  const locator = end - LOCATOR_BYTES;

  if (locator < 0 || tail.getUint32(locator, true) !== LOCATOR_SIGNATURE) return null;

  const at = Number(tail.getBigUint64(locator + 8, true));
  const record = await view(blob, at, at + END64_BYTES);

  if (record.byteLength < END64_BYTES || record.getUint32(0, true) !== END64_SIGNATURE) return null;

  return { size: Number(record.getBigUint64(40, true)), offset: Number(record.getBigUint64(48, true)) };
}

async function directoryOf(blob: Blob): Promise<Directory | null> {
  const from = Math.max(0, blob.size - END_BYTES - COMMENT_MAX - LOCATOR_BYTES);
  const tail = await view(blob, from, blob.size);
  const end = endRecordAt(tail);

  if (end < 0) return null;

  const size = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);

  return size === U32_MAX || offset === U32_MAX ? zip64Directory(blob, tail, end) : { size, offset };
}

export async function zipEntryNames(blob: Blob): Promise<string[]> {
  const directory = await directoryOf(blob);

  if (!directory || directory.offset + directory.size > blob.size) return [];

  const entries = await view(blob, directory.offset, directory.offset + directory.size);
  const decoder = new TextDecoder();
  const names: string[] = [];

  for (let at = 0; at + ENTRY_BYTES <= entries.byteLength && names.length < MAX_ENTRIES;) {
    if (entries.getUint32(at, true) !== ENTRY_SIGNATURE) break;

    const nameBytes = entries.getUint16(at + 28, true);
    const skip = nameBytes + entries.getUint16(at + 30, true) + entries.getUint16(at + 32, true);

    names.push(decoder.decode(new Uint8Array(entries.buffer, at + ENTRY_BYTES, nameBytes)));
    at += ENTRY_BYTES + skip;
  }

  return names;
}
