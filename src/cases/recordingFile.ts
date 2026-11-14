import type { Recording } from '../sim/recorder';

const MAGIC = 0x52544342;
const VERSION = 1;
const PREAMBLE = 12;
const MAX_HEADER = 16 * 1024 * 1024;
const MAX_FRAMES = 3_600_000;

type ArrayKind = 'f32' | 'f64' | 'i32';

type Typed = Float32Array | Float64Array | Int32Array;

const ARRAYS = {
  t: 'f32',
  ctrl: 'f32',
  qpos: 'f64',
  qvel: 'f32',
  poses: 'f32',
  torque: 'f32',
  jointQpos: 'i32',
  jointDof: 'i32',
  scan: 'f32',
} as const satisfies Record<string, ArrayKind>;

type ArrayKey = keyof typeof ARRAYS;

const REQUIRED: ArrayKey[] = ['t', 'ctrl', 'qpos', 'qvel', 'poses'];

const MAKERS: Record<ArrayKind, (buffer: ArrayBuffer) => Typed> = {
  f32: (b) => new Float32Array(b),
  f64: (b) => new Float64Array(b),
  i32: (b) => new Int32Array(b),
};

const SIZE: Record<ArrayKind, number> = { f32: 4, f64: 8, i32: 4 };

const TYPED_TAG = '$typed';

const TYPED_NAMES: Partial<Record<string, (values: number[]) => ArrayLike<number>>> = {
  Float32Array: (v) => Float32Array.from(v),
  Float64Array: (v) => Float64Array.from(v),
  Int32Array: (v) => Int32Array.from(v),
  Uint8Array: (v) => Uint8Array.from(v),
};

function keepTyped(_key: string, value: unknown) {
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return value;

  return { [TYPED_TAG]: value.constructor.name, values: Array.from(value as unknown as ArrayLike<number>) };
}

function restoreTyped(_key: string, value: unknown) {
  if (typeof value !== 'object' || value === null || !(TYPED_TAG in value)) return value;

  const { [TYPED_TAG]: name, values } = value as { [TYPED_TAG]: string; values: unknown };
  const make = TYPED_NAMES[name];

  return make && Array.isArray(values) ? make(values as number[]) : null;
}

const align8 = (n: number) => Math.ceil(n / 8) * 8;

type Header = Omit<Recording, ArrayKey> & { arrays: Array<[ArrayKey, number]> };

function splitRecording(recording: Recording) {
  const arrays: Array<[ArrayKey, Typed]> = [];
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(recording)) {
    if (key in ARRAYS && value) arrays.push([key as ArrayKey, value as Typed]);
    else rest[key] = value;
  }

  return { arrays, rest };
}

export function encodeRecording(recording: Recording): Uint8Array {
  const { arrays, rest } = splitRecording(recording);
  const header = new TextEncoder().encode(
    JSON.stringify({ ...rest, arrays: arrays.map(([key, a]) => [key, a.length]) }, keepTyped),
  );
  const start = align8(PREAMBLE + header.length);
  const total = arrays.reduce((at, [, a]) => align8(at + a.byteLength), start);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, header.length, true);
  out.set(header, PREAMBLE);

  let at = start;

  for (const [, a] of arrays) {
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at);
    at = align8(at + a.byteLength);
  }

  return out;
}

function readHeader(bytes: Uint8Array): Header | null {
  if (bytes.byteLength < PREAMBLE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);

  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;

  if (length > MAX_HEADER || PREAMBLE + length > bytes.byteLength) return null;

  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(PREAMBLE, PREAMBLE + length)), restoreTyped) as Header;
  } catch {
    return null;
  }
}

const isCount = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

function sizesFit(header: Header) {
  const { frames, nq, nv, nu, nbody } = header;

  if (!isCount(frames, MAX_FRAMES) || ![nq, nv, nu, nbody].every((n) => isCount(n, 100_000))) return false;

  if (!(typeof header.dt === 'number' && header.dt > 0 && Number.isFinite(header.dt))) return false;

  return header.scanWidth === undefined || isCount(header.scanWidth, 100_000);
}

function expectedLength(key: ArrayKey, h: Header): number | null {
  const lengths: Partial<Record<ArrayKey, number>> = {
    t: h.frames,
    ctrl: h.frames * h.nu,
    qpos: h.frames * h.nq,
    qvel: h.frames * h.nv,
    poses: h.frames * h.nbody * 7,
    torque: h.frames,
    scan: h.frames * (h.scanWidth ?? 0),
  };

  return lengths[key] ?? null;
}

const arraysFit = (h: Header) =>
  Array.isArray(h.arrays) &&
  h.arrays.every(
    (entry) =>
      Array.isArray(entry) &&
      entry[0] in ARRAYS &&
      isCount(entry[1]) &&
      (expectedLength(entry[0], h) ?? entry[1]) === entry[1],
  ) &&
  REQUIRED.every((key) => h.arrays.some(([k]) => k === key)) &&
  new Set(h.arrays.map(([k]) => k)).size === h.arrays.length;

function sliceArrays(bytes: Uint8Array, header: Header): Partial<Record<ArrayKey, Typed>> | null {
  const out: Partial<Record<ArrayKey, Typed>> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = align8(PREAMBLE + view.getUint32(8, true));

  for (const [key, length] of header.arrays) {
    const kind = ARRAYS[key];
    const size = length * SIZE[kind];

    if (at + size > bytes.byteLength) return null;

    out[key] = MAKERS[kind](bytes.slice(at, at + size).buffer);
    at = align8(at + size);
  }

  return out;
}

export function decodeRecording(bytes: Uint8Array): Recording | null {
  const header = readHeader(bytes);

  if (!header || typeof header !== 'object' || !sizesFit(header) || !arraysFit(header)) return null;

  const arrays = sliceArrays(bytes, header);

  if (!arrays) return null;

  const rest: Record<string, unknown> = { ...header };

  delete rest.arrays;

  return { ...rest, ...arrays } as Recording;
}
