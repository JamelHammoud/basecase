import { encodeEvaluationPayload, decodeEvaluationPayload, MAX_EVALUATION_PAYLOAD } from './evaluationPayload';
import { readEvaluationReplay } from './evaluationReplayValidation';
import { keepTyped, restoreTyped } from './recordingValues';
import { CONTINUATION_MAX_BYTES } from '../sim/continuationLimits';
import type { RecordedInput, Recording } from '../sim/recorder';
import { isTeachingRecording, teachingArraysFit, teachingLengths } from '../sim/teachingRecording';

const MAGIC = 0x52544342;
const VERSION = 1;
const PREAMBLE = 12;
const MAX_HEADER = 16 * 1024 * 1024;
const MAX_FRAMES = 3_600_000;

type ArrayKind = 'f32' | 'f64' | 'i32' | 'u8';

type Typed = Float32Array | Float64Array | Int32Array | Uint8Array;

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
  topics: 'u8',
  contacts: 'i32',
  contactOffsets: 'i32',
  continuation: 'u8',
  actionTime: 'f64',
  actionOwner: 'u8',
  actionCtrl: 'f64',
  actionQpos: 'f64',
  actionQvel: 'f64',
  actionPrevious: 'f32',
  evaluationData: 'u8',
} as const satisfies Record<string, ArrayKind>;

type ArrayKey = keyof typeof ARRAYS;

const REQUIRED: ArrayKey[] = ['t', 'ctrl', 'qpos', 'qvel', 'poses'];

const MAKERS: Record<ArrayKind, (buffer: ArrayBuffer) => Typed> = {
  f32: (b) => new Float32Array(b),
  f64: (b) => new Float64Array(b),
  i32: (b) => new Int32Array(b),
  u8: (b) => new Uint8Array(b),
};

const SIZE: Record<ArrayKind, number> = { f32: 4, f64: 8, i32: 4, u8: 1 };

const align8 = (n: number) => Math.ceil(n / 8) * 8;

type Header = Omit<Recording, ArrayKey> & { arrays: Array<[ArrayKey, number]> };

function splitRecording(recording: Recording) {
  const arrays: Array<[ArrayKey, Typed]> = [];
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(recording)) {
    if (key === 'evaluation' && recording.evaluation) {
      continue;
    }

    if (key in ARRAYS && value) arrays.push([key as ArrayKey, value as Typed]);
    else rest[key] = value;
  }

  if (recording.evaluation) arrays.push(['evaluationData', encodeEvaluationPayload(recording.evaluation)]);

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

  if (header.teaching !== undefined && !isTeachingRecording(header.teaching)) return false;

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
    contactOffsets: h.frames + 1,
    ...teachingLengths(h),
  };

  return lengths[key] ?? null;
}

const arraysFit = (h: Header) =>
  Array.isArray(h.arrays) &&
  h.arrays.every(
    (entry) =>
      Array.isArray(entry) &&
      entry[0] in ARRAYS &&
      isCount(entry[1], arrayLimit(entry[0])) &&
      (expectedLength(entry[0], h) ?? entry[1]) === entry[1],
  ) &&
  REQUIRED.every((key) => h.arrays.some(([k]) => k === key)) &&
  new Set(h.arrays.map(([k]) => k)).size === h.arrays.length;

function arrayLimit(key: ArrayKey): number {
  if (key === 'continuation') return CONTINUATION_MAX_BYTES;

  return key === 'evaluationData' ? MAX_EVALUATION_PAYLOAD : Number.MAX_SAFE_INTEGER;
}

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

const MAX_INPUT_NAME = 128;

const isInputValue = (v: unknown) =>
  typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

const isInput = (v: unknown): v is RecordedInput => {
  const input = v as Partial<RecordedInput> | null;

  return (
    typeof input === 'object' &&
    input !== null &&
    typeof input.at === 'number' &&
    Number.isFinite(input.at) &&
    input.at >= 0 &&
    typeof input.name === 'string' &&
    input.name.length <= MAX_INPUT_NAME &&
    isInputValue(input.value)
  );
};

const readInputs = (v: unknown): RecordedInput[] | undefined => {
  const kept = Array.isArray(v) ? v.filter(isInput).map(({ at, name, value }) => ({ at, name, value })) : [];

  return kept.length ? kept : undefined;
};

function contactsFit(arrays: Partial<Record<ArrayKey, Typed>>, header: Header): boolean {
  const { contacts, contactOffsets } = arrays;

  if (!contacts && !contactOffsets) return true;

  if (!(contacts instanceof Int32Array) || !(contactOffsets instanceof Int32Array)) return false;

  if (contacts.length % 2 || contactOffsets[0] !== 0 || contactOffsets.at(-1) !== contacts.length) return false;

  if (contacts.some((body) => body < 0 || body >= header.nbody)) return false;

  return contactOffsets.every((offset, i) => offset % 2 === 0 && (i === 0 || offset >= contactOffsets[i - 1]));
}

export function decodeRecording(bytes: Uint8Array): Recording | null {
  const header = readHeader(bytes);

  if (!header || typeof header !== 'object' || !sizesFit(header) || !arraysFit(header)) return null;

  const arrays = sliceArrays(bytes, header);

  if (!arrays || !contactsFit(arrays, header)) return null;

  const rest: Record<string, unknown> = { ...header };

  if (arrays.evaluationData) {
    try {
      rest.evaluation = decodeEvaluationPayload(arrays.evaluationData as Uint8Array);
      delete arrays.evaluationData;
    } catch {
      return null;
    }
  }

  delete rest.arrays;

  for (const key of Object.keys(ARRAYS)) delete rest[key];

  if (rest.evaluation !== undefined && !readEvaluationReplay(rest.evaluation)) return null;

  const inputs = readInputs(rest.inputs);

  delete rest.inputs;

  const recording = { ...rest, ...arrays, ...(inputs ? { inputs } : {}) } as Recording;

  return teachingArraysFit(recording) ? recording : null;
}
