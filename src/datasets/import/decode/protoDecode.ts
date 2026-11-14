import { Budget, DECODE_LIMITS, damaged, refused, tooLarge } from './limits';
import { TYPE_MESSAGE, type ProtoField, type ProtoMessage, type ProtoSchema } from './protoDescriptor';
import { ProtoReader, WIRE_FIXED32, WIRE_FIXED64, WIRE_LENGTH, WIRE_VARINT } from './protoWire';
import type { Decoded, DecodedMessage } from './types';

const TYPE_BOOL = 8;
const TYPE_STRING = 9;
const TYPE_BYTES = 12;

interface Scalar {
  wire: number;
  read: (reader: ProtoReader) => number;
}

const zigzag32 = (value: number) => (value >>> 1) ^ -(value & 1);
const zigzag64 = (value: bigint) => Number((value >> 1n) ^ -(value & 1n));

export const PROTO_SCALARS: Record<number, Scalar> = {
  1: { wire: WIRE_FIXED64, read: (reader) => reader.double() },
  2: { wire: WIRE_FIXED32, read: (reader) => reader.float() },
  3: { wire: WIRE_VARINT, read: (reader) => Number(BigInt.asIntN(64, reader.bigVarint())) },
  4: { wire: WIRE_VARINT, read: (reader) => Number(reader.bigVarint()) },
  5: { wire: WIRE_VARINT, read: (reader) => reader.uint32() | 0 },
  6: { wire: WIRE_FIXED64, read: (reader) => Number(reader.fixed64(false)) },
  7: { wire: WIRE_FIXED32, read: (reader) => reader.fixed32(false) },
  8: { wire: WIRE_VARINT, read: (reader) => (reader.bigVarint() === 0n ? 0 : 1) },
  13: { wire: WIRE_VARINT, read: (reader) => reader.uint32() },
  14: { wire: WIRE_VARINT, read: (reader) => reader.uint32() | 0 },
  15: { wire: WIRE_FIXED32, read: (reader) => reader.fixed32(true) },
  16: { wire: WIRE_FIXED64, read: (reader) => Number(reader.fixed64(true)) },
  17: { wire: WIRE_VARINT, read: (reader) => zigzag32(reader.uint32()) },
  18: { wire: WIRE_VARINT, read: (reader) => zigzag64(reader.bigVarint()) },
};

interface DecodeState {
  schema: ProtoSchema;
  budget: Budget;
}

interface Frame {
  reader: ProtoReader;
  depth: number;
  single: Map<number, Decoded>;
  lists: Map<number, Decoded[]>;
}

const isNumeric = (field: ProtoField) => Object.hasOwn(PROTO_SCALARS, field.type);

function defaultOf(field: ProtoField): Decoded | undefined {
  if (field.oneof || field.type === TYPE_MESSAGE) return undefined;

  if (field.type === TYPE_STRING) return '';

  if (field.type === TYPE_BYTES) return new Uint8Array(0);

  return field.type === TYPE_BOOL ? false : 0;
}

function push(state: DecodeState, list: Decoded[], value: Decoded) {
  if (list.length >= DECODE_LIMITS.items) throw tooLarge();

  state.budget.spend(1);
  list.push(value);
}

function readPacked(state: DecodeState, field: ProtoField, list: Decoded[], reader: ProtoReader) {
  const packed = new ProtoReader(reader.chunk());
  const scalar = PROTO_SCALARS[field.type];

  while (!packed.done) push(state, list, scalar.read(packed));
}

function readOne(state: DecodeState, field: ProtoField, frame: Frame): Decoded {
  const { reader } = frame;

  if (field.type === TYPE_STRING) return reader.string();

  if (field.type === TYPE_BYTES) return reader.chunk().slice();

  if (field.type === TYPE_MESSAGE) return decodeMessage(state, field.typeName, reader.chunk(), frame.depth + 1);

  const value = PROTO_SCALARS[field.type].read(reader);

  return field.type === TYPE_BOOL && !field.repeated ? value !== 0 : value;
}

function expectedWire(field: ProtoField) {
  return isNumeric(field) ? PROTO_SCALARS[field.type].wire : WIRE_LENGTH;
}

function readField(state: DecodeState, frame: Frame, field: ProtoField, wire: number) {
  const wanted = expectedWire(field);
  const packed = field.repeated && wire === WIRE_LENGTH && wanted !== WIRE_LENGTH;

  if (wire !== wanted && !packed) throw damaged();

  if (!field.repeated) {
    state.budget.spend(1);
    frame.single.set(field.number, readOne(state, field, frame));

    return;
  }

  const list = frame.lists.get(field.number) ?? [];

  frame.lists.set(field.number, list);

  if (packed) readPacked(state, field, list, frame.reader);
  else push(state, list, readOne(state, field, frame));
}

function assemble(message: ProtoMessage, values: Frame): DecodedMessage {
  const entries: [string, Decoded][] = [];

  for (const field of message.fields) {
    const list = values.lists.get(field.number) ?? [];
    const value = values.single.has(field.number) ? values.single.get(field.number) : defaultOf(field);

    if (field.repeated) entries.push([field.name, isNumeric(field) ? Float64Array.from(list as number[]) : list]);
    else if (value !== undefined) entries.push([field.name, value]);
  }

  return Object.fromEntries(entries);
}

function decodeMessage(state: DecodeState, typeName: string, bytes: Uint8Array, depth: number): DecodedMessage {
  const message = state.schema.messages.get(typeName);

  if (!message || depth > DECODE_LIMITS.depth) throw refused();

  const frame: Frame = { reader: new ProtoReader(bytes), depth, single: new Map(), lists: new Map() };

  while (!frame.reader.done) {
    const { field, wire } = frame.reader.tag();
    const spec = message.byNumber.get(field);

    if (spec) readField(state, frame, spec, wire);
    else frame.reader.skip(wire);
  }

  return assemble(message, frame);
}

export function decodeProtobuf(schema: ProtoSchema, typeName: string, bytes: Uint8Array): DecodedMessage {
  return decodeMessage({ schema, budget: new Budget() }, typeName, bytes, 1);
}
