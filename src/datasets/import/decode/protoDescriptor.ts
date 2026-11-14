import { DECODE_LIMITS, refused } from './limits';
import { ProtoReader, WIRE_LENGTH, WIRE_VARINT } from './protoWire';

export const TYPE_GROUP = 10;
export const TYPE_MESSAGE = 11;
export const TYPE_ENUM = 14;

const LABEL_REPEATED = 3;
const LAST_TYPE = 18;

export interface ProtoField {
  name: string;
  number: number;
  repeated: boolean;
  type: number;
  typeName: string;
  oneof: boolean;
}

export interface ProtoMessage {
  name: string;
  fields: ProtoField[];
  byNumber: Map<number, ProtoField>;
}

export interface ProtoSchema {
  messages: Map<string, ProtoMessage>;
  enums: Set<string>;
}

interface Walk extends ProtoSchema {
  types: number;
  fields: number;
}

type FieldReader = (reader: ProtoReader, wire: number) => void;

function eachField(bytes: Uint8Array, readers: Record<number, FieldReader>) {
  const reader = new ProtoReader(bytes);

  while (!reader.done) {
    const { field, wire } = reader.tag();
    const read = Object.hasOwn(readers, field) ? readers[field] : null;

    if (read) read(reader, wire);
    else reader.skip(wire);
  }
}

const requireWire = (wire: number, wanted: number) => {
  if (wire !== wanted) throw refused();
};

const text = (assign: (value: string) => void): FieldReader => {
  return (reader, wire) => {
    requireWire(wire, WIRE_LENGTH);
    assign(reader.string());
  };
};

const varint = (assign: (value: number) => void): FieldReader => {
  return (reader, wire) => {
    requireWire(wire, WIRE_VARINT);
    assign(reader.uint32());
  };
};

const chunks = (list: Uint8Array[]): FieldReader => {
  return (reader, wire) => {
    requireWire(wire, WIRE_LENGTH);
    list.push(reader.chunk());
  };
};

function parseField(bytes: Uint8Array): ProtoField {
  const field: ProtoField = { name: '', number: 0, repeated: false, type: 0, typeName: '', oneof: false };

  eachField(bytes, {
    1: text((value) => (field.name = value)),
    3: varint((value) => (field.number = value)),
    4: varint((value) => (field.repeated = value === LABEL_REPEATED)),
    5: varint((value) => (field.type = value)),
    6: text((value) => (field.typeName = value.replace(/^\./, ''))),
    9: varint(() => (field.oneof = true)),
  });

  if (field.name === '' || field.number === 0 || field.type > LAST_TYPE || field.type === TYPE_GROUP) throw refused();

  return field;
}

function countType(walk: Walk, fields: number) {
  walk.types += 1;
  walk.fields += fields;

  if (walk.types > DECODE_LIMITS.types || walk.fields > DECODE_LIMITS.fields) throw refused();
}

function nameOf(bytes: Uint8Array): string {
  let name = '';

  eachField(bytes, { 1: text((value) => (name = value)) });

  if (name === '') throw refused();

  return name;
}

function parseMessage(bytes: Uint8Array, prefix: string, walk: Walk, depth: number) {
  const parts = { name: '', fields: [] as Uint8Array[], nested: [] as Uint8Array[], enums: [] as Uint8Array[] };

  if (depth > DECODE_LIMITS.depth) throw refused();

  eachField(bytes, {
    1: text((value) => (parts.name = value)),
    2: chunks(parts.fields),
    3: chunks(parts.nested),
    4: chunks(parts.enums),
  });

  const name = `${prefix}${parts.name}`;

  countType(walk, parts.fields.length);

  const fields = parts.fields.map(parseField);

  walk.messages.set(name, { name, fields, byNumber: new Map(fields.map((field) => [field.number, field])) });

  for (const nested of parts.nested) parseMessage(nested, `${name}.`, walk, depth + 1);

  for (const value of parts.enums) addEnum(walk, `${name}.${nameOf(value)}`);
}

function addEnum(walk: Walk, name: string) {
  countType(walk, 0);
  walk.enums.add(name);
}

function parseFile(bytes: Uint8Array, walk: Walk) {
  const parts = { pkg: '', messages: [] as Uint8Array[], enums: [] as Uint8Array[] };

  eachField(bytes, {
    2: text((value) => (parts.pkg = value)),
    4: chunks(parts.messages),
    5: chunks(parts.enums),
  });

  const prefix = parts.pkg ? `${parts.pkg}.` : '';

  for (const message of parts.messages) parseMessage(message, prefix, walk, 1);

  for (const value of parts.enums) addEnum(walk, `${prefix}${nameOf(value)}`);
}

function resolveField(schema: ProtoSchema, field: ProtoField) {
  const message = schema.messages.has(field.typeName);
  const known = message || schema.enums.has(field.typeName);
  const named = field.type === 0 || field.type === TYPE_MESSAGE || field.type === TYPE_ENUM;

  if (named && !known) throw refused();

  if (field.type === 0) field.type = message ? TYPE_MESSAGE : TYPE_ENUM;

  if (field.type === TYPE_MESSAGE && !message) throw refused();
}

function parseSet(bytes: Uint8Array): ProtoSchema {
  const walk: Walk = { messages: new Map(), enums: new Set(), types: 0, fields: 0 };
  const files: Uint8Array[] = [];

  eachField(bytes, { 1: chunks(files) });

  for (const file of files) parseFile(file, walk);

  const schema = { messages: walk.messages, enums: walk.enums };

  for (const message of schema.messages.values()) {
    for (const field of message.fields) resolveField(schema, field);
  }

  return schema;
}

export function parseDescriptorSet(bytes: Uint8Array): ProtoSchema {
  if (bytes.byteLength > DECODE_LIMITS.schemaBytes) throw refused();

  try {
    return parseSet(bytes);
  } catch {
    throw refused();
  }
}
