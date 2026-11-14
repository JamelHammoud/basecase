import { DECODE_LIMITS, damaged, tooLarge } from './limits';
import type { RosDialect } from './rosDefinition';

const ENCAPSULATION_BYTES = 4;
const CDR_BIG_ENDIAN = 0;
const CDR_LITTLE_ENDIAN = 1;
const MAX_CODE_POINT = 0x10ffff;

type NumberRead = (view: DataView, offset: number, little: boolean) => number;

const NUMBER_READS: Record<string, NumberRead> = {
  bool: (view, offset) => view.getUint8(offset),
  char: (view, offset) => view.getUint8(offset),
  uint8: (view, offset) => view.getUint8(offset),
  int8: (view, offset) => view.getInt8(offset),
  int16: (view, offset, little) => view.getInt16(offset, little),
  uint16: (view, offset, little) => view.getUint16(offset, little),
  int32: (view, offset, little) => view.getInt32(offset, little),
  uint32: (view, offset, little) => view.getUint32(offset, little),
  int64: (view, offset, little) => Number(view.getBigInt64(offset, little)),
  uint64: (view, offset, little) => Number(view.getBigUint64(offset, little)),
  float32: (view, offset, little) => view.getFloat32(offset, little),
  float64: (view, offset, little) => view.getFloat64(offset, little),
};

const NUMBER_BYTES: Record<string, number> = {
  bool: 1,
  char: 1,
  uint8: 1,
  int8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  int64: 8,
  uint64: 8,
  float32: 4,
  float64: 8,
};

export const numberKind = (type: string, dialect: RosDialect) => {
  if (type === 'byte') return dialect === 'ros1' ? 'int8' : 'uint8';

  return Object.hasOwn(NUMBER_READS, type) ? type : null;
};

function cdrHeader(bytes: Uint8Array) {
  const known = bytes[1] === CDR_BIG_ENDIAN || bytes[1] === CDR_LITTLE_ENDIAN;

  if (bytes.byteLength < ENCAPSULATION_BYTES || bytes[0] !== 0 || !known) throw damaged();

  return { little: bytes[1] === CDR_LITTLE_ENDIAN, origin: ENCAPSULATION_BYTES };
}

export class RosReader {
  readonly #view: DataView;
  readonly #bytes: Uint8Array;
  readonly #little: boolean;
  readonly #origin: number;
  readonly #aligned: boolean;
  readonly #text = new TextDecoder();
  #offset: number;

  constructor(bytes: Uint8Array, dialect: RosDialect) {
    const header = dialect === 'cdr' ? cdrHeader(bytes) : { little: true, origin: 0 };

    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#little = header.little;
    this.#origin = header.origin;
    this.#aligned = dialect === 'cdr';
    this.#offset = header.origin;
  }

  get remaining() {
    return this.#view.byteLength - this.#offset;
  }

  #take(size: number, align: number): number {
    const body = this.#offset - this.#origin;
    const start = this.#aligned ? this.#origin + Math.ceil(body / align) * align : this.#offset;

    if (size > this.#view.byteLength - start) throw damaged();

    this.#offset = start + size;

    return start;
  }

  number(kind: string): number {
    const size = NUMBER_BYTES[kind];

    return NUMBER_READS[kind](this.#view, this.#take(size, size), this.#little);
  }

  count(minItemBytes: number): number {
    const size = this.number('uint32');

    if (size * minItemBytes > this.remaining) throw damaged();

    return size;
  }

  bytes(length: number): Uint8Array {
    const start = this.#take(length, 1);

    return this.#bytes.slice(start, start + length);
  }

  string(): string {
    const length = this.count(1);
    const start = this.#take(length, 1);
    const nul = this.#aligned && length > 0 && this.#bytes[start + length - 1] === 0;

    return this.#text.decode(this.#bytes.subarray(start, start + length - (nul ? 1 : 0)));
  }

  wstring(): string {
    if (!this.#aligned) return this.string();

    const length = this.count(4);
    let text = '';

    if (length > DECODE_LIMITS.items) throw tooLarge();

    for (let i = 0; i < length; i++) {
      const unit = this.number('uint32');

      if (unit > 0 && unit <= MAX_CODE_POINT) text += String.fromCodePoint(unit);
    }

    return text;
  }
}
