import { parseDescriptorSet, TYPE_ENUM, TYPE_MESSAGE, type ProtoField, type ProtoSchema } from './protoDescriptor';
import { PROTO_SCALARS } from './protoDecode';
import { WIRE_LENGTH, WIRE_VARINT } from './protoWire';

export const PROTO_TYPES = {
  double: 1,
  float: 2,
  int64: 3,
  uint64: 4,
  int32: 5,
  fixed64: 6,
  fixed32: 7,
  bool: 8,
  string: 9,
  message: TYPE_MESSAGE,
  bytes: 12,
  uint32: 13,
  enum: TYPE_ENUM,
  sfixed32: 15,
  sfixed64: 16,
  sint32: 17,
  sint64: 18,
};

const LABEL_OPTIONAL = 1;
const LABEL_REPEATED = 3;

export interface ProtoFieldSpec {
  name: string;
  number: number;
  type: number;
  typeName?: string;
  repeated?: boolean;
  oneof?: boolean;
}

export interface ProtoEnumSpec {
  name: string;
  values: [name: string, number: number][];
}

export interface ProtoMessageSpec {
  name: string;
  fields: ProtoFieldSpec[];
  nested?: ProtoMessageSpec[];
  enums?: ProtoEnumSpec[];
}

export interface ProtoFileSpec {
  name: string;
  package: string;
  messages: ProtoMessageSpec[];
  enums?: ProtoEnumSpec[];
}

export class ProtoWriter {
  #parts: Uint8Array[] = [];
  #size = 0;
  readonly #scratch = new DataView(new ArrayBuffer(8));

  #push(bytes: Uint8Array) {
    this.#parts.push(bytes);
    this.#size += bytes.byteLength;
  }

  varint(value: number | bigint) {
    let rest = BigInt.asUintN(64, BigInt(value));
    const out: number[] = [];

    while (rest >= 0x80n) {
      out.push(Number(rest & 0x7fn) | 0x80);
      rest >>= 7n;
    }

    out.push(Number(rest));
    this.#push(Uint8Array.from(out));

    return this;
  }

  tag(field: number, wire: number) {
    return this.varint(field * 8 + wire);
  }

  fixed(size: 4 | 8, write: (view: DataView) => void) {
    write(this.#scratch);
    this.#push(new Uint8Array(this.#scratch.buffer.slice(0, size)));

    return this;
  }

  chunk(field: number, bytes: Uint8Array) {
    this.tag(field, WIRE_LENGTH).varint(bytes.byteLength);
    this.#push(bytes.slice());

    return this;
  }

  string(field: number, value: string) {
    return this.chunk(field, new TextEncoder().encode(value));
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.#size);
    let offset = 0;

    for (const part of this.#parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }

    return out;
  }
}

const zigzag = (value: bigint) => (value << 1n) ^ (value >> 63n);
const whole = (value: unknown) => BigInt(typeof value === 'bigint' ? value : Math.trunc(Number(value ?? 0)));

type ScalarWrite = (writer: ProtoWriter, value: unknown) => void;

const SCALAR_WRITES: Record<number, ScalarWrite> = {
  1: (writer, value) => writer.fixed(8, (view) => view.setFloat64(0, Number(value), true)),
  2: (writer, value) => writer.fixed(4, (view) => view.setFloat32(0, Number(value), true)),
  3: (writer, value) => writer.varint(whole(value)),
  4: (writer, value) => writer.varint(whole(value)),
  5: (writer, value) => writer.varint(whole(value)),
  6: (writer, value) => writer.fixed(8, (view) => view.setBigUint64(0, whole(value), true)),
  7: (writer, value) => writer.fixed(4, (view) => view.setUint32(0, Number(value), true)),
  8: (writer, value) => writer.varint(value ? 1 : 0),
  13: (writer, value) => writer.varint(whole(value)),
  14: (writer, value) => writer.varint(whole(value)),
  15: (writer, value) => writer.fixed(4, (view) => view.setInt32(0, Number(value), true)),
  16: (writer, value) => writer.fixed(8, (view) => view.setBigInt64(0, whole(value), true)),
  17: (writer, value) => writer.varint(BigInt.asUintN(32, zigzag(whole(value)))),
  18: (writer, value) => writer.varint(zigzag(whole(value))),
};

function enumBytes(spec: ProtoEnumSpec) {
  const writer = new ProtoWriter().string(1, spec.name);

  for (const [name, number] of spec.values)
    writer.chunk(2, new ProtoWriter().string(1, name).tag(2, 0).varint(number).bytes());

  return writer.bytes();
}

function fieldBytes(spec: ProtoFieldSpec) {
  const writer = new ProtoWriter().string(1, spec.name);

  writer.tag(3, WIRE_VARINT).varint(spec.number);
  writer.tag(4, WIRE_VARINT).varint(spec.repeated ? LABEL_REPEATED : LABEL_OPTIONAL);
  writer.tag(5, WIRE_VARINT).varint(spec.type);

  if (spec.typeName) writer.string(6, spec.typeName);

  if (spec.oneof) writer.tag(9, WIRE_VARINT).varint(0);

  return writer.bytes();
}

export function messageBytes(spec: ProtoMessageSpec): Uint8Array {
  const writer = new ProtoWriter().string(1, spec.name);

  for (const field of spec.fields) writer.chunk(2, fieldBytes(field));

  for (const nested of spec.nested ?? []) writer.chunk(3, messageBytes(nested));

  for (const value of spec.enums ?? []) writer.chunk(4, enumBytes(value));

  return writer.bytes();
}

export function descriptorSet(files: ProtoFileSpec[]): Uint8Array {
  const set = new ProtoWriter();

  for (const file of files) {
    const writer = new ProtoWriter().string(1, file.name).string(2, file.package);

    for (const message of file.messages) writer.chunk(4, messageBytes(message));

    for (const value of file.enums ?? []) writer.chunk(5, enumBytes(value));

    set.chunk(1, writer.bytes());
  }

  return set.bytes();
}

const double = (name: string, number: number): ProtoFieldSpec => ({ name, number, type: PROTO_TYPES.double });
const message = (name: string, number: number, typeName: string): ProtoFieldSpec => ({
  name,
  number,
  type: PROTO_TYPES.message,
  typeName,
});

const LOG_LEVELS: ProtoEnumSpec = {
  name: 'Level',
  values: [
    ['UNKNOWN', 0],
    ['DEBUG', 1],
    ['INFO', 2],
    ['WARNING', 3],
    ['ERROR', 4],
    ['FATAL', 5],
  ],
};

const TIMESTAMP_FILE: ProtoFileSpec = {
  name: 'google/protobuf/timestamp.proto',
  package: 'google.protobuf',
  messages: [
    {
      name: 'Timestamp',
      fields: [
        { name: 'seconds', number: 1, type: PROTO_TYPES.int64 },
        { name: 'nanos', number: 2, type: PROTO_TYPES.int32 },
      ],
    },
  ],
};

const FOXGLOVE_FILE: ProtoFileSpec = {
  name: 'foxglove.proto',
  package: 'foxglove',
  messages: [
    { name: 'Vector3', fields: [double('x', 1), double('y', 2), double('z', 3)] },
    { name: 'Quaternion', fields: [double('x', 1), double('y', 2), double('z', 3), double('w', 4)] },
    {
      name: 'Pose',
      fields: [message('position', 1, '.foxglove.Vector3'), message('orientation', 2, '.foxglove.Quaternion')],
    },
    {
      name: 'PoseInFrame',
      fields: [
        message('timestamp', 1, '.google.protobuf.Timestamp'),
        { name: 'frame_id', number: 2, type: PROTO_TYPES.string },
        message('pose', 3, '.foxglove.Pose'),
      ],
    },
    {
      name: 'Log',
      enums: [LOG_LEVELS],
      fields: [
        message('timestamp', 1, '.google.protobuf.Timestamp'),
        { name: 'level', number: 2, type: PROTO_TYPES.enum, typeName: '.foxglove.Log.Level' },
        { name: 'message', number: 3, type: PROTO_TYPES.string },
        { name: 'name', number: 4, type: PROTO_TYPES.string },
        { name: 'file', number: 5, type: PROTO_TYPES.string },
        { name: 'line', number: 6, type: PROTO_TYPES.fixed32 },
      ],
    },
  ],
};

export const protobufSchema = () => descriptorSet([TIMESTAMP_FILE, FOXGLOVE_FILE]);

export interface ProtobufOptions {
  schema?: Uint8Array;
  packed?: boolean;
}

interface EncodeState {
  schema: ProtoSchema;
  packed: boolean;
}

function writeOne(state: EncodeState, writer: ProtoWriter, field: ProtoField, value: unknown) {
  if (field.type === PROTO_TYPES.string) writer.string(field.number, String(value));
  else if (field.type === PROTO_TYPES.bytes) writer.chunk(field.number, value as Uint8Array);
  else if (field.type === PROTO_TYPES.message) writer.chunk(field.number, encodeMessage(state, field.typeName, value));
  else SCALAR_WRITES[field.type](writer.tag(field.number, PROTO_SCALARS[field.type].wire), value);
}

function writeRepeated(state: EncodeState, writer: ProtoWriter, field: ProtoField, value: unknown) {
  const items = Array.from(value as ArrayLike<unknown>);
  const numeric = Object.hasOwn(SCALAR_WRITES, field.type);

  if (!numeric || !state.packed) {
    for (const item of items) writeOne(state, writer, field, item);

    return;
  }

  const packed = new ProtoWriter();

  for (const item of items) SCALAR_WRITES[field.type](packed, item);

  writer.chunk(field.number, packed.bytes());
}

function encodeMessage(state: EncodeState, typeName: string, value: unknown): Uint8Array {
  const spec = state.schema.messages.get(typeName);
  const fields = (value ?? {}) as Record<string, unknown>;
  const writer = new ProtoWriter();

  if (!spec) throw new Error(`No message ${typeName}`);

  for (const field of spec.fields) {
    const item = fields[field.name];

    if (item === undefined || item === null) continue;

    if (field.repeated) writeRepeated(state, writer, field, item);
    else writeOne(state, writer, field, item);
  }

  return writer.bytes();
}

export function encodeProtobuf(typeName: string, value: Record<string, unknown>, options: ProtobufOptions = {}) {
  const schema = parseDescriptorSet(options.schema ?? protobufSchema());

  return encodeMessage({ schema, packed: options.packed ?? true }, typeName, value);
}
