import { Budget, damaged } from './limits';
import { PRIMITIVE_BYTES, type RosField, type RosSchema } from './rosDefinition';
import { numberKind, RosReader } from './rosWire';
import type { Decoded, DecodedMessage } from './types';

const BLOB_TYPES = new Set(['uint8', 'byte', 'char']);
const LISTED_TYPES = new Set(['string', 'wstring', 'time', 'duration']);

interface DecodeState {
  schema: RosSchema;
  reader: RosReader;
  budget: Budget;
}

function readStamp(reader: RosReader, type: string): DecodedMessage {
  const kind = type === 'duration' ? 'int32' : 'uint32';
  const sec = reader.number(kind);

  return { sec, nsec: reader.number(kind) };
}

function readScalar(state: DecodeState, type: string): Decoded {
  const { reader } = state;

  if (type === 'string') return reader.string();

  if (type === 'wstring') return reader.wstring();

  if (type === 'time' || type === 'duration') return readStamp(reader, type);

  const kind = numberKind(type, state.schema.dialect);

  if (kind === 'bool') return reader.number(kind) !== 0;

  return kind ? reader.number(kind) : readMessage(state, type);
}

function readNumbers(state: DecodeState, type: string, length: number): Float64Array {
  const kind = numberKind(type, state.schema.dialect);
  const values = new Float64Array(length);

  if (!kind) throw damaged();

  for (let i = 0; i < length; i++) values[i] = state.reader.number(kind);

  return kind === 'bool' ? values.map((value) => (value === 0 ? 0 : 1)) : values;
}

function readArray(state: DecodeState, type: string, length: number): Decoded {
  if (BLOB_TYPES.has(type)) return state.reader.bytes(length);

  const listed = LISTED_TYPES.has(type) || numberKind(type, state.schema.dialect) === null;

  if (listed) return Array.from({ length }, () => readScalar(state, type));

  return readNumbers(state, type, length);
}

function elementBytes(schema: RosSchema, field: RosField) {
  if (field.primitive) return PRIMITIVE_BYTES[field.type];

  const type = schema.types.get(field.type);

  if (!type) throw damaged();

  return type.minBytes;
}

function readField(state: DecodeState, field: RosField): Decoded {
  if (field.kind === 'single') {
    state.budget.spend(1);

    return readScalar(state, field.type);
  }

  const length = field.kind === 'fixed' ? field.bound : state.reader.number('uint32');

  if (length > field.bound || length * elementBytes(state.schema, field) > state.reader.remaining) throw damaged();

  state.budget.spend(BLOB_TYPES.has(field.type) ? 1 : length);

  return readArray(state, field.type, length);
}

function readMessage(state: DecodeState, typeName: string): DecodedMessage {
  const type = state.schema.types.get(typeName);
  const message: DecodedMessage = {};

  if (!type) throw damaged();

  state.budget.spend(1);

  if (type.fields.length === 0 && state.schema.dialect === 'cdr') {
    state.reader.number('uint8');

    return message;
  }

  for (const field of type.fields) message[field.name] = readField(state, field);

  return message;
}

export function decodeRos(schema: RosSchema, bytes: Uint8Array): DecodedMessage {
  const state = { schema, reader: new RosReader(bytes, schema.dialect), budget: new Budget() };

  return readMessage(state, schema.root);
}
