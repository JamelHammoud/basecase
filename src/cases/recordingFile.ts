import { packArrays, unpackArrays, type ArrayKind } from '../../electron/library/arrayFile.mjs';
import type { Recording } from '../sim/recorder';

const MAX_FRAMES = 3_600_000;

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

type Typed = Float32Array | Float64Array | Int32Array;

const REQUIRED: ArrayKey[] = ['t', 'ctrl', 'qpos', 'qvel', 'poses'];

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

  return packArrays(rest, arrays, keepTyped);
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
  h.arrays.every(([key, length]) => (expectedLength(key, h) ?? length) === length) &&
  REQUIRED.every((key) => h.arrays.some(([k]) => k === key));

export function decodeRecording(bytes: Uint8Array): Recording | null {
  const unpacked = unpackArrays(bytes, ARRAYS, restoreTyped);
  const header = unpacked?.header as Header | undefined;

  if (!unpacked || !header || !sizesFit(header) || !arraysFit(header)) return null;

  const rest: Record<string, unknown> = { ...header };

  delete rest.arrays;

  return { ...rest, ...unpacked.arrays } as unknown as Recording;
}
