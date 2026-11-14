import { Builder } from 'flatbuffers';

export const FB = {
  none: 0,
  utype: 1,
  bool: 2,
  byte: 3,
  ubyte: 4,
  short: 5,
  ushort: 6,
  int: 7,
  uint: 8,
  long: 9,
  ulong: 10,
  float: 11,
  double: 12,
  string: 13,
  vector: 14,
  obj: 15,
  union: 16,
  array: 17,
};

export interface FlatTypeSpec {
  base: number;
  element?: number;
  index?: number;
  length?: number;
}
export interface FlatFieldSpec {
  name: string;
  type: FlatTypeSpec;
  id: number;
  offset?: number;
  integer?: bigint;
  real?: number;
  optional?: boolean;
  required?: boolean;
  offset64?: boolean;
}
export interface FlatObjectSpec {
  name: string;
  fields: FlatFieldSpec[];
  struct?: boolean;
  size?: number;
  align?: number;
}
export interface FlatEnumSpec {
  name: string;
  base: number;
  union?: boolean;
  values: Array<{ name: string; value: bigint; type?: FlatTypeSpec }>;
}

function offsets(b: Builder, items: number[]) {
  b.startVector(4, items.length, 4);

  for (const item of items.toReversed()) b.addOffset(item);

  return b.endVector();
}

function type(b: Builder, t: FlatTypeSpec) {
  b.startObject(6);
  b.addFieldInt8(0, t.base, 0);
  b.addFieldInt8(1, t.element ?? 0, 0);
  b.addFieldInt32(2, t.index ?? -1, -1);
  b.addFieldInt16(3, t.length ?? 0, 0);

  return b.endObject();
}

function field(b: Builder, f: FlatFieldSpec) {
  const name = b.createString(f.name);
  const spec = type(b, f.type);

  b.startObject(14);
  b.addFieldOffset(0, name, 0);
  b.addFieldOffset(1, spec, 0);
  b.addFieldInt16(2, f.id, 0);
  b.addFieldInt16(3, f.offset ?? 4 + f.id * 2, 0);
  b.addFieldInt64(4, f.integer ?? 0n, 0n);
  b.addFieldFloat64(5, f.real ?? 0, 0);
  b.addFieldInt8(7, f.required ? 1 : 0, 0);
  b.addFieldInt8(11, f.optional ? 1 : 0, 0);
  b.addFieldInt8(13, f.offset64 ? 1 : 0, 0);

  return b.endObject();
}

function object(b: Builder, o: FlatObjectSpec) {
  const name = b.createString(o.name);
  const fields = offsets(
    b,
    o.fields.map((f) => field(b, f)),
  );

  b.startObject(8);
  b.addFieldOffset(0, name, 0);
  b.addFieldOffset(1, fields, 0);
  b.addFieldInt8(2, o.struct ? 1 : 0, 0);
  b.addFieldInt32(3, o.align ?? 4, 0);
  b.addFieldInt32(4, o.size ?? 0, 0);

  return b.endObject();
}

function enumeration(b: Builder, e: FlatEnumSpec) {
  const name = b.createString(e.name);
  const values = offsets(
    b,
    e.values.map((v) => {
      const label = b.createString(v.name);
      const union = v.type ? type(b, v.type) : 0;

      b.startObject(6);
      b.addFieldOffset(0, label, 0);
      b.addFieldInt64(1, v.value, 0n);
      b.addFieldOffset(3, union, 0);

      return b.endObject();
    }),
  );
  const underlying = type(b, { base: e.base });

  b.startObject(7);
  b.addFieldOffset(0, name, 0);
  b.addFieldOffset(1, values, 0);
  b.addFieldInt8(2, e.union ? 1 : 0, 0);
  b.addFieldOffset(3, underlying, 0);

  return b.endObject();
}

export function flatSchema(objects: FlatObjectSpec[], enums: FlatEnumSpec[] = []) {
  const b = new Builder(1024);
  const entries = objects.map((o) => object(b, o));
  const os = offsets(b, entries);
  const es = offsets(
    b,
    enums.map((e) => enumeration(b, e)),
  );

  b.startObject(8);
  b.addFieldOffset(0, os, 0);
  b.addFieldOffset(1, es, 0);
  b.addFieldOffset(4, entries[0], 0);
  b.finish(b.endObject(), 'BFBS');

  return b.asUint8Array().slice();
}

export const TELEMETRY_OBJECTS: FlatObjectSpec[] = [
  {
    name: 'robot.Telemetry',
    fields: [
      { name: 'volts', id: 0, type: { base: FB.double }, real: 12.5 },
      { name: 'mode', id: 1, type: { base: FB.ubyte, index: 0 } },
      { name: 'nested', id: 2, type: { base: FB.obj, index: 1 } },
      { name: 'points', id: 3, type: { base: FB.vector, element: FB.obj, index: 2 } },
      { name: 'bytes', id: 4, type: { base: FB.vector, element: FB.ubyte } },
      { name: 'signed', id: 5, type: { base: FB.long } },
      { name: 'unsigned', id: 6, type: { base: FB.ulong } },
      { name: 'optional', id: 7, type: { base: FB.int }, optional: true },
      { name: 'choice_type', id: 8, type: { base: FB.utype, index: 1 } },
      { name: 'choice', id: 9, type: { base: FB.union, index: 1 } },
    ],
  },
  { name: 'robot.Nested', fields: [{ name: 'name', id: 0, type: { base: FB.string } }] },
  {
    name: 'robot.Point',
    struct: true,
    size: 16,
    align: 8,
    fields: [
      { name: 'x', id: 0, offset: 0, type: { base: FB.double } },
      { name: 'y', id: 1, offset: 8, type: { base: FB.double } },
    ],
  },
];
export const TELEMETRY_ENUMS: FlatEnumSpec[] = [
  {
    name: 'robot.Mode',
    base: FB.ubyte,
    values: [
      { name: 'Idle', value: 0n },
      { name: 'Moving', value: 1n },
    ],
  },
  {
    name: 'robot.Choice',
    base: FB.utype,
    union: true,
    values: [
      { name: 'NONE', value: 0n },
      { name: 'Nested', value: 1n, type: { base: FB.obj, index: 1 } },
      { name: 'Text', value: 2n, type: { base: FB.string } },
    ],
  },
];
export const telemetrySchema = () => flatSchema(TELEMETRY_OBJECTS, TELEMETRY_ENUMS);

export function flatNested(name: string, b = new Builder(64)) {
  const text = b.createString(name);

  b.startObject(1);
  b.addFieldOffset(0, text, 0);

  return { b, offset: b.endObject() };
}

export function flatTelemetry(sample = 0, boundaries = false) {
  const b = new Builder(256);
  const nested = flatNested(`wrist-${sample}`, b).offset;
  const bytes = b.createByteVector(Uint8Array.from([0, 255, sample]));

  b.startVector(16, 2, 8);

  for (const i of [1, 0]) {
    b.writeFloat64(sample + i + 0.5);
    b.writeFloat64(sample + i);
  }

  const points = b.endVector();

  b.startObject(10);
  b.addFieldFloat64(0, 12.5 - sample, 12.5);
  b.addFieldInt8(1, sample % 2, 0);
  b.addFieldOffset(2, nested, 0);
  b.addFieldOffset(3, points, 0);
  b.addFieldOffset(4, bytes, 0);
  b.addFieldInt64(5, boundaries ? -(2n ** 63n) : BigInt(sample), 0n);
  b.addFieldInt64(6, boundaries ? 2n ** 64n - 1n : BigInt(sample), 0n);
  b.addFieldInt8(8, 1, 0);
  b.addFieldOffset(9, nested, 0);
  b.finish(b.endObject());

  return b.asUint8Array().slice();
}
