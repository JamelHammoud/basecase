import { damaged } from './limits';

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH = 2;
export const WIRE_FIXED32 = 5;

const MAX_VARINT_BYTES = 10;
const CONTINUE = 0x80;
const PAYLOAD = 0x7f;

export interface ProtoTag {
  field: number;
  wire: number;
}

export class ProtoReader {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;
  readonly #text = new TextDecoder();
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done() {
    return this.#offset >= this.#bytes.byteLength;
  }

  #byte(): number {
    if (this.done) throw damaged();

    return this.#bytes[this.#offset++];
  }

  #take(size: number): number {
    if (size > this.#bytes.byteLength - this.#offset) throw damaged();

    const start = this.#offset;

    this.#offset += size;

    return start;
  }

  bigVarint(): bigint {
    let value = 0n;

    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      const byte = this.#byte();

      value |= BigInt(byte & PAYLOAD) << BigInt(7 * i);

      if ((byte & CONTINUE) === 0) return BigInt.asUintN(64, value);
    }

    throw damaged();
  }

  uint32(): number {
    let value = 0;

    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      const byte = this.#byte();

      value = i < 5 ? (value | ((byte & PAYLOAD) << (7 * i))) >>> 0 : value;

      if ((byte & CONTINUE) === 0) return value;
    }

    throw damaged();
  }

  tag(): ProtoTag {
    const tag = this.uint32();
    const field = tag >>> 3;

    if (field === 0) throw damaged();

    return { field, wire: tag & 7 };
  }

  float(): number {
    return this.#view.getFloat32(this.#take(4), true);
  }

  double(): number {
    return this.#view.getFloat64(this.#take(8), true);
  }

  fixed32(signed: boolean): number {
    const start = this.#take(4);

    return signed ? this.#view.getInt32(start, true) : this.#view.getUint32(start, true);
  }

  fixed64(signed: boolean): bigint {
    const start = this.#take(8);

    return signed ? this.#view.getBigInt64(start, true) : this.#view.getBigUint64(start, true);
  }

  chunk(): Uint8Array {
    const length = this.uint32();
    const start = this.#take(length);

    return this.#bytes.subarray(start, start + length);
  }

  string(): string {
    return this.#text.decode(this.chunk());
  }

  skip(wire: number) {
    if (wire === WIRE_VARINT) this.bigVarint();
    else if (wire === WIRE_FIXED64) this.#take(8);
    else if (wire === WIRE_LENGTH) this.chunk();
    else if (wire === WIRE_FIXED32) this.#take(4);
    else throw damaged();
  }
}
