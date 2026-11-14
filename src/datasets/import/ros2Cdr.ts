import { plural } from '../../../electron/plural.mjs';
import { IMPORT_LIMITS } from './types';

export const MCAP_DAMAGED = 'This recording is damaged.';
export const MCAP_TOO_MANY_JOINTS = `This recording has more than ${plural(IMPORT_LIMITS.joints, 'joint')}.`;

const ENCAPSULATION_BYTES = 4;
const CDR_BIG_ENDIAN = 0;
const CDR_LITTLE_ENDIAN = 1;
const NS_PER_SECOND = 1_000_000_000;

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
