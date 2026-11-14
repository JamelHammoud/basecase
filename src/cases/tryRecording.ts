import type { Recording } from '../sim/recorder';

const MAGIC = 0x52544342;
const VERSION = 1;
const PREAMBLE = 16;
const ALIGN = 8;

const TYPED = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
} as const;

type TypedName = keyof typeof TYPED;

type Typed = InstanceType<(typeof TYPED)[TypedName]>;

type Slot = [type: TypedName, offset: number, length: number];

const aligned = (n: number) => Math.ceil(n / ALIGN) * ALIGN;

const typedName = (value: unknown): TypedName | null => {
  const name = (value as { constructor?: { name?: string } } | null)?.constructor?.name;

  return name && name in TYPED && ArrayBuffer.isView(value) ? (name as TypedName) : null;
};

const isSlotRef = (value: unknown): value is { $bin: number } =>
  typeof value === 'object' && value !== null && typeof (value as { $bin?: unknown }).$bin === 'number';

function headerOf(recording: Recording) {
  const arrays: Typed[] = [];
  const json = JSON.stringify(recording, (_key, value: unknown) => {
    if (!typedName(value)) return value;

    arrays.push(value as Typed);

    return { $bin: arrays.length - 1 };
  });

  return { json, arrays };
}

export function packRecording(recording: Recording): Uint8Array {
  const { json, arrays } = headerOf(recording);
  let offset = 0;
  const slots: Slot[] = arrays.map((a) => {
    const slot: Slot = [typedName(a)!, offset, a.length];

    offset = aligned(offset + a.byteLength);

    return slot;
  });
  const header = new TextEncoder().encode(json);
  const table = new TextEncoder().encode(JSON.stringify(slots));
  const start = aligned(PREAMBLE + header.length + table.length);
  const bytes = new Uint8Array(start + offset);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, header.length, true);
  view.setUint32(12, table.length, true);
  bytes.set(header, PREAMBLE);
  bytes.set(table, PREAMBLE + header.length);
  arrays.forEach((a, i) => bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + slots[i][1]));

  return bytes;
}

export function unpackRecording(bytes: Uint8Array): Recording {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.byteLength < PREAMBLE || view.getUint32(0, true) !== MAGIC) throw new Error('Not a try recording.');

  if (view.getUint32(4, true) > VERSION) throw new Error('Recorded with a newer Basecase. Update to open it.');

  const headerLength = view.getUint32(8, true);
  const tableLength = view.getUint32(12, true);
  const decode = (from: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(PREAMBLE + from, PREAMBLE + from + length));
  const slots = JSON.parse(decode(headerLength, tableLength)) as Slot[];
  const start = bytes.byteOffset + aligned(PREAMBLE + headerLength + tableLength);
  const arrays = slots.map(([type, offset, length]) => {
    const Make = TYPED[type];
    const from = start + offset;

    const copy = new Uint8Array(length * Make.BYTES_PER_ELEMENT);

    copy.set(new Uint8Array(bytes.buffer, from, copy.length));

    return new Make(copy.buffer);
  });

  return JSON.parse(decode(0, headerLength), (_key, value: unknown) =>
    isSlotRef(value) ? arrays[value.$bin] : value,
  ) as Recording;
}
