import type { Recording } from '../sim/recorder';

const MAGIC = 'BCTRY001';
const ALIGN = 8;

const TYPED = { Float32Array, Float64Array, Int32Array } as const;

type TypedName = keyof typeof TYPED;

type Typed = Float32Array | Float64Array | Int32Array;

interface ArrayEntry {
  key: string;
  type: TypedName;
  offset: number;
  length: number;
}

interface Header {
  meta: Record<string, unknown>;
  arrays: ArrayEntry[];
}

const typeOf = (value: unknown): TypedName | null => {
  if (value instanceof Float32Array) return 'Float32Array';

  if (value instanceof Float64Array) return 'Float64Array';

  return value instanceof Int32Array ? 'Int32Array' : null;
};

const padded = (n: number) => Math.ceil(n / ALIGN) * ALIGN;

const nestedTyped = (_key: string, value: unknown) => {
  const type = typeOf(value);

  return type ? { $typed: type, values: Array.from(value as Typed) } : value;
};

const revived = (_key: string, value: unknown) => {
  if (!value || typeof value !== 'object' || !('$typed' in value)) return value;

  const { $typed, values } = value as { $typed: TypedName; values: number[] };

  return TYPED[$typed] ? new TYPED[$typed](values) : value;
};

export function encodeRecording(recording: Recording): Uint8Array {
  const meta: Record<string, unknown> = {};
  const arrays: ArrayEntry[] = [];
  const bodies: Typed[] = [];
  let offset = 0;

  for (const [key, value] of Object.entries(recording)) {
    const type = typeOf(value);

    if (!type) {
      meta[key] = value;

      continue;
    }

    const array = value as Typed;

    arrays.push({ key, type, offset, length: array.length });
    bodies.push(array);
    offset += padded(array.byteLength);
  }

  const head = new TextEncoder().encode(JSON.stringify({ meta, arrays } satisfies Header, nestedTyped));
  const start = padded(MAGIC.length + 4 + head.length);
  const out = new Uint8Array(start + offset);

  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(MAGIC.length, head.length, true);
  out.set(head, MAGIC.length + 4);
  arrays.forEach((entry, i) => {
    const body = bodies[i];

    out.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), start + entry.offset);
  });

  return out;
}

export function decodeRecording(bytes: Uint8Array): Recording | null {
  if (bytes.length < MAGIC.length + 4 || new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC)
    return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headLength = view.getUint32(MAGIC.length, true);
  const headEnd = MAGIC.length + 4 + headLength;
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(MAGIC.length + 4, headEnd)), revived) as Header;
  const start = padded(headEnd);
  const out: Record<string, unknown> = { ...header.meta };

  for (const { key, type, offset, length } of header.arrays) {
    const Kind = TYPED[type];
    const from = start + offset;

    out[key] = new Kind(bytes.slice(from, from + length * Kind.BYTES_PER_ELEMENT).buffer);
  }

  return out as unknown as Recording;
}
