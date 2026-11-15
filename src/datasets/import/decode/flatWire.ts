import { Budget, damaged, DECODE_LIMITS, tooLarge } from './limits';

export const FLAT_SIZE = [0, 1, 1, 1, 1, 2, 2, 4, 4, 8, 8, 4, 8, 4, 4, 4, 4, 0];
export const exactInteger = (value: bigint): number | bigint => {
  const number = Number(value);

  return Number.isSafeInteger(number) ? number : value;
};

type ScalarRead = (view: DataView, at: number) => number | bigint | boolean;

const SCALAR_READS: Record<number, ScalarRead> = {
  1: (v, at) => v.getUint8(at),
  2: (v, at) => v.getUint8(at) !== 0,
  3: (v, at) => v.getInt8(at),
  4: (v, at) => v.getUint8(at),
  5: (v, at) => v.getInt16(at, true),
  6: (v, at) => v.getUint16(at, true),
  7: (v, at) => v.getInt32(at, true),
  8: (v, at) => v.getUint32(at, true),
  9: (v, at) => exactInteger(v.getBigInt64(at, true)),
  10: (v, at) => exactInteger(v.getBigUint64(at, true)),
  11: (v, at) => v.getFloat32(at, true),
  12: (v, at) => v.getFloat64(at, true),
};

export class FlatWire {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  readonly budget = new Budget();
  readonly text = new TextDecoder('utf-8', { fatal: true });

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  range(at: number, size: number) {
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(size) || at < 0 || size < 0 || at > this.bytes.length - size)
      throw damaged();

    return at;
  }

  u16(at: number) {
    return this.view.getUint16(this.range(at, 2), true);
  }
  u32(at: number) {
    return this.view.getUint32(this.range(at, 4), true);
  }
  i32(at: number) {
    return this.view.getInt32(this.range(at, 4), true);
  }
  i64(at: number) {
    return this.view.getBigInt64(this.range(at, 8), true);
  }
  f64(at: number) {
    return this.view.getFloat64(this.range(at, 8), true);
  }

  indirect(at: number) {
    const offset = this.u32(at);

    if (offset < 4) throw damaged();

    return this.range(at + offset, 1);
  }

  table(at: number) {
    const vtable = at - this.i32(at);
    const size = this.u16(vtable);
    const inline = this.u16(vtable + 2);

    if (size < 4 || size % 2 !== 0 || inline < 4) throw damaged();

    if (vtable < at + inline && vtable + size > at) throw damaged();

    this.range(vtable, size);
    this.range(at, inline);

    return (offset: number, width = 1) => {
      if (offset >= size) return 0;

      const position = this.u16(vtable + offset);

      if (position === 0) return 0;

      if (position < 4 || position + width > inline) throw damaged();

      return at + position;
    };
  }

  field(at: number, slot: number, width = 4) {
    return this.table(at)(4 + 2 * slot, width);
  }

  vector(at: number, width: number) {
    const start = this.indirect(at);
    const length = this.u32(start);

    if (length > DECODE_LIMITS.items) throw tooLarge();

    this.range(start + 4, length * width);
    this.budget.spend(length);

    return { start: start + 4, length };
  }

  string(at: number) {
    const start = this.indirect(at);
    const length = this.u32(start);

    this.range(start + 4, length + 1);

    if (this.bytes[start + 4 + length] !== 0) throw damaged();

    this.budget.spend(length);

    return this.text.decode(this.bytes.subarray(start + 4, start + 4 + length));
  }

  scalar(base: number, at: number): number | bigint | boolean {
    this.range(at, FLAT_SIZE[base]);

    const read = SCALAR_READS[base];

    if (!read) throw damaged();

    return read(this.view, at);
  }
}
