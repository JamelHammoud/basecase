import { lz4Frame } from './lz4';
import { MCAP_TOO_LARGE } from './decode/limits';
import { MCAP_DAMAGED } from './ros2Cdr';
import { DataImportError, IMPORT_LIMITS } from './types';

export const BAG1_COMPRESSION = 'Only LZ4 or uncompressed ROS 1 bags open.';

export interface BagConnection {
  id: number;
  topic: string;
  type: string;
  definition: string;
}

export interface BagMessage {
  conn: number;
  ns: bigint;
  data: Uint8Array;
}

export interface BagVisitor {
  connection: (c: BagConnection) => void;
  message: (m: BagMessage) => void;
}

export { isBagName } from './sourceKind';

export const BAG1_OP = { message: 0x02, bagHeader: 0x03, index: 0x04, chunk: 0x05, chunkInfo: 0x06, connection: 0x07 };

const MAGIC = new TextEncoder().encode('#ROSBAG V2.0\n');
const WORD_BYTES = 4;
const HEADER_BYTES = 1024 * 1024;
const DEFINITION_BYTES = 1024 * 1024;
const MESSAGE_BYTES = 64 * 1024 * 1024;
const NS_PER_SECOND = 1_000_000_000;
const EQUALS = 0x3d;
const TOP_LEVEL_OPS = new Set([BAG1_OP.message, BAG1_OP.index, BAG1_OP.chunk, BAG1_OP.chunkInfo, BAG1_OP.connection]);
const CHUNK_OPS = new Set([BAG1_OP.message, BAG1_OP.connection]);

type Fields = Map<string, Uint8Array>;

interface BagRecord {
  op: number;
  fields: Fields;
  data: Uint8Array;
  next: number;
}

interface BagState {
  visit: BagVisitor;
  seen: Set<number>;
  text: TextDecoder;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

function wordAt(bytes: Uint8Array, at: number) {
  if (at + WORD_BYTES > bytes.length) throw damaged();

  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

function fieldsOf(header: Uint8Array, text: TextDecoder): Fields {
  const fields: Fields = new Map();

  for (let at = 0; at < header.length;) {
    const length = wordAt(header, at);
    const start = at + WORD_BYTES;
    const end = start + length;

    if (end > header.length) throw damaged();

    const field = header.subarray(start, end);
    const split = field.indexOf(EQUALS);

    if (split <= 0) throw damaged();

    fields.set(text.decode(field.subarray(0, split)), field.subarray(split + 1));
    at = end;
  }

  return fields;
}

function fieldOf(fields: Fields, name: string, bytes?: number) {
  const value = fields.get(name);

  if (value === undefined || (bytes !== undefined && value.length !== bytes)) throw damaged();

  return value;
}

const fieldWord = (fields: Fields, name: string) => wordAt(fieldOf(fields, name, WORD_BYTES), 0);

const fieldText = (state: BagState, fields: Fields, name: string) => state.text.decode(fieldOf(fields, name));

function fieldTime(fields: Fields) {
  const time = fieldOf(fields, 'time', 2 * WORD_BYTES);
  const nsec = wordAt(time, WORD_BYTES);

  if (nsec >= NS_PER_SECOND) throw damaged();

  return BigInt(wordAt(time, 0)) * BigInt(NS_PER_SECOND) + BigInt(nsec);
}

function recordAt(bytes: Uint8Array, at: number, text: TextDecoder): BagRecord {
  const headerLength = wordAt(bytes, at);
  const headerStart = at + WORD_BYTES;
  const headerEnd = headerStart + headerLength;

  if (headerLength > HEADER_BYTES || headerEnd > bytes.length) throw damaged();

  const fields = fieldsOf(bytes.subarray(headerStart, headerEnd), text);
  const op = fieldOf(fields, 'op', 1)[0];
  const dataLength = wordAt(bytes, headerEnd);
  const dataStart = headerEnd + WORD_BYTES;
  const next = dataStart + dataLength;

  if (op === BAG1_OP.message && dataLength > MESSAGE_BYTES) throw new DataImportError(MCAP_TOO_LARGE);

  if (next > bytes.length) throw damaged();

  return { op, fields, data: bytes.subarray(dataStart, next), next };
}

function takeConnection(state: BagState, record: BagRecord) {
  const id = fieldWord(record.fields, 'conn');
  const topic = fieldText(state, record.fields, 'topic');
  const header = fieldsOf(record.data, state.text);
  const type = fieldText(state, header, 'type');

  fieldOf(header, 'md5sum');

  if (fieldOf(header, 'message_definition').length > DEFINITION_BYTES) throw damaged();

  if (state.seen.has(id)) return;

  state.seen.add(id);
  state.visit.connection({ id, topic, type, definition: fieldText(state, header, 'message_definition') });
}

function takeMessage(state: BagState, record: BagRecord) {
  const conn = fieldWord(record.fields, 'conn');
  const ns = fieldTime(record.fields);

  if (!state.seen.has(conn)) return;

  state.visit.message({ conn, ns, data: record.data });
}

function inflateLz4(data: Uint8Array, size: number) {
  try {
    return lz4Frame(data, size);
  } catch {
    throw damaged();
  }
}

function chunkRecords(state: BagState, record: BagRecord) {
  const compression = fieldText(state, record.fields, 'compression');
  const size = fieldWord(record.fields, 'size');

  if (compression !== 'none' && compression !== 'lz4') throw new DataImportError(BAG1_COMPRESSION);

  if (size > IMPORT_LIMITS.chunkBytes) throw new DataImportError(MCAP_TOO_LARGE);

  if (compression === 'lz4') return inflateLz4(record.data, size);

  if (record.data.length !== size) throw damaged();

  return record.data;
}

function readRecords(state: BagState, bytes: Uint8Array, options: { at: number; ops: Set<number> }) {
  for (let at = options.at; at < bytes.length;) {
    const record = recordAt(bytes, at, state.text);

    if (!options.ops.has(record.op)) throw damaged();

    if (record.op === BAG1_OP.connection) takeConnection(state, record);

    if (record.op === BAG1_OP.message) takeMessage(state, record);

    if (record.op === BAG1_OP.chunk) readRecords(state, chunkRecords(state, record), { at: 0, ops: CHUNK_OPS });

    at = record.next;
  }
}

function bagHeaderEnd(bytes: Uint8Array, text: TextDecoder) {
  const magic = bytes.subarray(0, MAGIC.length);

  if (magic.length !== MAGIC.length || magic.some((byte, i) => byte !== MAGIC[i])) throw damaged();

  const header = recordAt(bytes, MAGIC.length, text);

  if (header.op !== BAG1_OP.bagHeader) throw damaged();

  fieldOf(header.fields, 'index_pos', 2 * WORD_BYTES);
  fieldWord(header.fields, 'conn_count');
  fieldWord(header.fields, 'chunk_count');

  return header.next;
}

export function readBag1(bytes: Uint8Array, visit: BagVisitor): void {
  const state: BagState = { visit, seen: new Set(), text: new TextDecoder('utf-8', { fatal: true }) };

  try {
    readRecords(state, bytes, { at: bagHeaderEnd(bytes, state.text), ops: TOP_LEVEL_OPS });
  } catch (error) {
    throw error instanceof DataImportError ? error : damaged();
  }
}
