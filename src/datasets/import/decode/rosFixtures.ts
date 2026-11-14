import { parseRosDefinition, type RosDialect, type RosField, type RosSchema } from './rosDefinition';
import { numberKind } from './rosWire';

export type FixtureMessage = Record<string, unknown>;

export interface CdrOptions {
  bigEndian?: boolean;
}

type NumberWrite = (view: DataView, value: number, little: boolean) => void;

const NUMBER_WRITES: Record<string, [size: number, write: NumberWrite]> = {
  bool: [1, (view, value) => view.setUint8(0, value)],
  char: [1, (view, value) => view.setUint8(0, value)],
  uint8: [1, (view, value) => view.setUint8(0, value)],
  int8: [1, (view, value) => view.setInt8(0, value)],
  int16: [2, (view, value, little) => view.setInt16(0, value, little)],
  uint16: [2, (view, value, little) => view.setUint16(0, value, little)],
  int32: [4, (view, value, little) => view.setInt32(0, value, little)],
  uint32: [4, (view, value, little) => view.setUint32(0, value, little)],
  int64: [8, (view, value, little) => view.setBigInt64(0, BigInt(Math.trunc(value)), little)],
  uint64: [8, (view, value, little) => view.setBigUint64(0, BigInt(Math.trunc(value)), little)],
  float32: [4, (view, value, little) => view.setFloat32(0, value, little)],
  float64: [8, (view, value, little) => view.setFloat64(0, value, little)],
};

const BLOB_TYPES = new Set(['uint8', 'byte', 'char']);

class RosWriter {
  readonly #bytes: number[] = [];
  readonly #little: boolean;
  readonly #origin: number;
  readonly #aligned: boolean;
  readonly #scratch = new DataView(new ArrayBuffer(8));
  readonly #text = new TextEncoder();

  constructor(dialect: RosDialect, bigEndian: boolean) {
    this.#aligned = dialect === 'cdr';
    this.#little = !bigEndian;
    this.#origin = this.#aligned ? 4 : 0;

    if (this.#aligned) this.#bytes.push(0, bigEndian ? 0 : 1, 0, 0);
  }

  #align(size: number) {
    while (this.#aligned && (this.#bytes.length - this.#origin) % size !== 0) this.#bytes.push(0);
  }

  number(kind: string, value: number) {
    const [size, write] = NUMBER_WRITES[kind];

    this.#align(size);
    write(this.#scratch, value, this.#little);

    for (let i = 0; i < size; i++) this.#bytes.push(this.#scratch.getUint8(i));
  }

  raw(bytes: ArrayLike<number>) {
    for (let i = 0; i < bytes.length; i++) this.#bytes.push(bytes[i]);
  }

  string(value: string) {
    const encoded = this.#text.encode(value);

    this.number('uint32', encoded.length + (this.#aligned ? 1 : 0));
    this.raw(encoded);

    if (this.#aligned) this.#bytes.push(0);
  }

  wstring(value: string) {
    if (!this.#aligned) {
      this.string(value);

      return;
    }

    const points = [...value].map((char) => char.codePointAt(0) ?? 0);

    this.number('uint32', points.length);

    for (const point of points) this.number('uint32', point);
  }

  bytes() {
    return Uint8Array.from(this.#bytes);
  }
}

interface EncodeState {
  schema: RosSchema;
  writer: RosWriter;
}

function writeStamp(writer: RosWriter, type: string, value: unknown) {
  const stamp = (value ?? {}) as { sec?: number; nsec?: number };
  const kind = type === 'duration' ? 'int32' : 'uint32';

  writer.number(kind, stamp.sec ?? 0);
  writer.number(kind, stamp.nsec ?? 0);
}

function writeScalar(state: EncodeState, type: string, value: unknown) {
  const { writer } = state;
  const kind = numberKind(type, state.schema.dialect);

  if (type === 'string') writer.string(String(value ?? ''));
  else if (type === 'wstring') writer.wstring(String(value ?? ''));
  else if (type === 'time' || type === 'duration') writeStamp(writer, type, value);
  else if (kind) writer.number(kind, Number(value ?? 0));
  else writeMessage(state, type, (value ?? {}) as FixtureMessage);
}

function writeField(state: EncodeState, field: RosField, value: unknown) {
  if (field.kind === 'single') {
    writeScalar(state, field.type, value);

    return;
  }

  if (field.kind === 'sequence' && value instanceof Uint8Array) {
    state.writer.number('uint32', value.length);
    state.writer.raw(value);

    return;
  }

  const given = Array.from((value ?? []) as ArrayLike<unknown>);
  const items = field.kind === 'fixed' ? Array.from({ length: field.bound }, (_, i) => given[i]) : given;

  if (field.kind === 'sequence') state.writer.number('uint32', items.length);

  if (BLOB_TYPES.has(field.type)) state.writer.raw(items.map((item) => Number(item ?? 0)));
  else for (const item of items) writeScalar(state, field.type, item);
}

function writeMessage(state: EncodeState, typeName: string, value: FixtureMessage) {
  const type = state.schema.types.get(typeName);

  if (!type) throw new Error(`No definition for ${typeName}`);

  if (type.fields.length === 0 && state.schema.dialect === 'cdr') state.writer.number('uint8', 0);

  for (const field of type.fields) writeField(state, field, value[field.name]);
}

interface EncodeTarget {
  dialect: RosDialect;
  definition: string;
  typeName: string;
  bigEndian?: boolean;
}

function encode(target: EncodeTarget, value: FixtureMessage) {
  const schema = parseRosDefinition(target.definition, target.typeName, target.dialect);
  const state = { schema, writer: new RosWriter(target.dialect, target.bigEndian ?? false) };

  writeMessage(state, schema.root, value);

  return state.writer.bytes();
}

export function encodeCdr(definition: string, typeName: string, value: FixtureMessage, options: CdrOptions = {}) {
  return encode({ dialect: 'cdr', definition, typeName, bigEndian: options.bigEndian }, value);
}

export function encodeRos1(definition: string, typeName: string, value: FixtureMessage) {
  return encode({ dialect: 'ros1', definition, typeName }, value);
}
