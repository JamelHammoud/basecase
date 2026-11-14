import { DataImportError, IMPORT_LIMITS } from './types';

export const MCAP_DAMAGED = 'This MCAP file is damaged.';
export const MCAP_TOO_MANY_JOINTS = `This MCAP file has more than ${IMPORT_LIMITS.joints} joints.`;

const ENCAPSULATION_BYTES = 4;
const CDR_BIG_ENDIAN = 0;
const CDR_LITTLE_ENDIAN = 1;
const NAME_CHARS = 256;
const FRAME_ID_CHARS = 1024;
const NS_PER_SECOND = 1_000_000_000;

export interface RosStamp {
  stamp: number;
  stampNs: bigint;
}

export interface JointStateMessage extends RosStamp {
  name: string[];
  position: Float64Array;
  velocity: Float64Array;
  effort: Float64Array;
}

export interface JointStateInput {
  stamp: number;
  name: string[];
  position: ArrayLike<number>;
  velocity?: ArrayLike<number>;
  effort?: ArrayLike<number>;
  frameId?: string;
  bigEndian?: boolean;
}

export interface CompressedImageInput {
  stamp: number;
  format: string;
  data: Uint8Array;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

class CdrReader {
  readonly #view: DataView;
  readonly #little: boolean;
  readonly #text = new TextDecoder();
  #offset = ENCAPSULATION_BYTES;

  constructor(bytes: Uint8Array) {
    const known = bytes[1] === CDR_BIG_ENDIAN || bytes[1] === CDR_LITTLE_ENDIAN;

    if (bytes.byteLength < ENCAPSULATION_BYTES || bytes[0] !== 0 || !known) throw damaged();

    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#little = bytes[1] === CDR_LITTLE_ENDIAN;
  }

  get #remaining() {
    return this.#view.byteLength - this.#offset;
  }

  #take(size: number, align: number): number {
    const body = this.#offset - ENCAPSULATION_BYTES;
    const start = ENCAPSULATION_BYTES + Math.ceil(body / align) * align;

    if (start + size > this.#view.byteLength) throw damaged();

    this.#offset = start + size;

    return start;
  }

  int32() {
    return this.#view.getInt32(this.#take(4, 4), this.#little);
  }

  uint32() {
    return this.#view.getUint32(this.#take(4, 4), this.#little);
  }

  count(cap: number, itemBytes: number) {
    const size = this.uint32();

    if (size > cap) throw new DataImportError(MCAP_TOO_MANY_JOINTS);

    if (size * itemBytes > this.#remaining) throw damaged();

    return size;
  }

  string(maxChars: number) {
    const length = this.uint32();

    if (length > maxChars + 1) throw damaged();

    const start = this.#take(length, 1);
    const bytes = new Uint8Array(this.#view.buffer, this.#view.byteOffset + start, length);
    const end = length > 0 && bytes[length - 1] === 0 ? length - 1 : length;

    return this.#text.decode(bytes.subarray(0, end));
  }

  float64s() {
    const size = this.count(IMPORT_LIMITS.joints, 8);
    const values = new Float64Array(size);

    if (size === 0) return values;

    const start = this.#take(size * 8, 8);

    for (let i = 0; i < size; i++) values[i] = this.#view.getFloat64(start + i * 8, this.#little);

    return values;
  }
}

function readStamp(reader: CdrReader): RosStamp {
  const sec = reader.int32();
  const nanosec = reader.uint32();

  if (nanosec >= NS_PER_SECOND) throw damaged();

  reader.string(FRAME_ID_CHARS);

  return { stamp: sec + nanosec / NS_PER_SECOND, stampNs: BigInt(sec) * BigInt(NS_PER_SECOND) + BigInt(nanosec) };
}

export function decodeImageStamp(bytes: Uint8Array): RosStamp {
  return readStamp(new CdrReader(bytes));
}

export function decodeJointState(bytes: Uint8Array): JointStateMessage {
  const reader = new CdrReader(bytes);
  const stamp = readStamp(reader);
  const name = Array.from({ length: reader.count(IMPORT_LIMITS.joints, 4) }, () => reader.string(NAME_CHARS));
  const position = reader.float64s();
  const velocity = reader.float64s();
  const effort = reader.float64s();

  if (position.length > 0 && position.length !== name.length) throw damaged();

  return { ...stamp, name, position, velocity, effort };
}

class CdrWriter {
  readonly #bytes: number[];
  readonly #little: boolean;
  readonly #scratch = new DataView(new ArrayBuffer(8));
  readonly #text = new TextEncoder();

  constructor(bigEndian = false) {
    this.#little = !bigEndian;
    this.#bytes = [0, bigEndian ? CDR_BIG_ENDIAN : CDR_LITTLE_ENDIAN, 0, 0];
  }

  #align(size: number) {
    while ((this.#bytes.length - ENCAPSULATION_BYTES) % size !== 0) this.#bytes.push(0);
  }

  #flush(size: number) {
    for (let i = 0; i < size; i++) this.#bytes.push(this.#scratch.getUint8(i));
  }

  int32(value: number) {
    this.#align(4);
    this.#scratch.setInt32(0, value, this.#little);
    this.#flush(4);
  }

  uint32(value: number) {
    this.#align(4);
    this.#scratch.setUint32(0, value, this.#little);
    this.#flush(4);
  }

  float64(value: number) {
    this.#align(8);
    this.#scratch.setFloat64(0, value, this.#little);
    this.#flush(8);
  }

  raw(bytes: Uint8Array) {
    this.uint32(bytes.length);

    for (const byte of bytes) this.#bytes.push(byte);
  }

  string(value: string) {
    const encoded = this.#text.encode(value);

    this.uint32(encoded.length + 1);
    this.#bytes.push(...encoded, 0);
  }

  float64s(values: ArrayLike<number>) {
    this.uint32(values.length);

    for (let i = 0; i < values.length; i++) this.float64(values[i]);
  }

  header(stamp: number, frameId: string) {
    const sec = Math.floor(stamp);
    const nanosec = Math.round((stamp - sec) * NS_PER_SECOND);
    const carried = nanosec === NS_PER_SECOND;

    this.int32(carried ? sec + 1 : sec);
    this.uint32(carried ? 0 : nanosec);
    this.string(frameId);
  }

  bytes() {
    return Uint8Array.from(this.#bytes);
  }
}

export function encodeJointState(input: JointStateInput): Uint8Array {
  const writer = new CdrWriter(input.bigEndian);

  writer.header(input.stamp, input.frameId ?? '');
  writer.uint32(input.name.length);

  for (const name of input.name) writer.string(name);

  writer.float64s(input.position);
  writer.float64s(input.velocity ?? []);
  writer.float64s(input.effort ?? []);

  return writer.bytes();
}

export function encodeCompressedImage(input: CompressedImageInput): Uint8Array {
  const writer = new CdrWriter();

  writer.header(input.stamp, '');
  writer.string(input.format);
  writer.raw(input.data);

  return writer.bytes();
}
