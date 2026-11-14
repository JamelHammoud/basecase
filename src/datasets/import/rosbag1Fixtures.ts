import { lz4FrameStored } from './mcapFixtures';
import { BAG1_OP } from './rosbag1';

export interface Bag1FixtureMessage {
  topic: string;
  type: string;
  definition: string;
  ns: bigint;
  data: Uint8Array;
}

export interface Bag1FixtureOptions {
  chunked?: boolean;
  compression?: 'none' | 'lz4';
  chunkSize?: number;
}

export interface Bag1FixtureConnection {
  id: number;
  topic: string;
  type: string;
  definition: string;
}

type FieldValue = string | Uint8Array;

interface ChunkPlan {
  records: Uint8Array[];
  size: number;
  index: Map<number, Array<{ ns: bigint; offset: number }>>;
}

const encoder = new TextEncoder();
const MAGIC = encoder.encode('#ROSBAG V2.0\n');
const BAG_HEADER_BYTES = 4096;
const DEFAULT_CHUNK_BYTES = 768 * 1024;
const INDEX_VERSION = 1;
const NS_PER_SECOND = 1_000_000_000n;
const SPACE = 0x20;

const lengthOf = (parts: Uint8Array[]) => parts.reduce((total, part) => total + part.length, 0);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(lengthOf(parts));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export function bagWord(value: number): Uint8Array {
  const out = new Uint8Array(4);

  new DataView(out.buffer).setUint32(0, value, true);

  return out;
}

export function bagLong(value: bigint): Uint8Array {
  const out = new Uint8Array(8);

  new DataView(out.buffer).setBigUint64(0, value, true);

  return out;
}

export const bagTime = (ns: bigint) =>
  concat([bagWord(Number(ns / NS_PER_SECOND)), bagWord(Number(ns % NS_PER_SECOND))]);

export const bagOp = (op: number) => Uint8Array.of(op);

export function bagFields(fields: Record<string, FieldValue>): Uint8Array {
  const parts = Object.entries(fields).flatMap(([name, value]) => {
    const field = concat([encoder.encode(`${name}=`), typeof value === 'string' ? encoder.encode(value) : value]);

    return [bagWord(field.length), field];
  });

  return concat(parts);
}

export function bagRecord(fields: Record<string, FieldValue>, data: Uint8Array, declaredLength = data.length) {
  const header = bagFields(fields);

  return concat([bagWord(header.length), header, bagWord(declaredLength), data]);
}

export function bagConnection(connection: Bag1FixtureConnection): Uint8Array {
  const header = bagFields({
    topic: connection.topic,
    type: connection.type,
    md5sum: '*',
    message_definition: connection.definition,
  });

  return bagRecord({ op: bagOp(BAG1_OP.connection), conn: bagWord(connection.id), topic: connection.topic }, header);
}

export const bagMessage = (conn: number, message: { ns: bigint; data: Uint8Array }) =>
  bagRecord({ op: bagOp(BAG1_OP.message), conn: bagWord(conn), time: bagTime(message.ns) }, message.data);

export const bagChunk = (compression: string, records: Uint8Array, size = records.length) =>
  bagRecord({ op: bagOp(BAG1_OP.chunk), compression, size: bagWord(size) }, records);

function bagHeader(counts: { indexPos: number; conns: number; chunks: number }) {
  const header = bagFields({
    op: bagOp(BAG1_OP.bagHeader),
    index_pos: bagLong(BigInt(counts.indexPos)),
    conn_count: bagWord(counts.conns),
    chunk_count: bagWord(counts.chunks),
  });
  const padding = BAG_HEADER_BYTES - header.length - 8;

  return concat([bagWord(header.length), header, bagWord(padding), new Uint8Array(padding).fill(SPACE)]);
}

export function bagFile(records: Uint8Array[], counts = { indexPos: 0, conns: 0, chunks: 0 }): Uint8Array {
  return concat([MAGIC, bagHeader(counts), ...records]);
}

const newChunk = (): ChunkPlan => ({ records: [], size: 0, index: new Map() });

function addRecord(chunk: ChunkPlan, record: Uint8Array) {
  chunk.records.push(record);
  chunk.size += record.length;
}

function connectionFor(connections: Map<string, Bag1FixtureConnection>, message: Bag1FixtureMessage, chunk: ChunkPlan) {
  const known = connections.get(message.topic);

  if (known) return known;

  const connection = { id: connections.size, topic: message.topic, type: message.type, definition: message.definition };

  connections.set(message.topic, connection);
  addRecord(chunk, bagConnection(connection));

  return connection;
}

function plan(messages: Bag1FixtureMessage[], chunkSize: number) {
  const connections = new Map<string, Bag1FixtureConnection>();
  const chunks: ChunkPlan[] = [];
  let chunk = newChunk();

  for (const message of messages) {
    const connection = connectionFor(connections, message, chunk);
    const entries = chunk.index.get(connection.id) ?? [];

    entries.push({ ns: message.ns, offset: chunk.size });
    chunk.index.set(connection.id, entries);
    addRecord(chunk, bagMessage(connection.id, message));

    if (chunk.size >= chunkSize) {
      chunks.push(chunk);
      chunk = newChunk();
    }
  }

  if (chunk.records.length > 0) chunks.push(chunk);

  return { connections: [...connections.values()], chunks };
}

function indexRecords(chunk: ChunkPlan) {
  return [...chunk.index].map(([conn, entries]) =>
    bagRecord(
      { op: bagOp(BAG1_OP.index), ver: bagWord(INDEX_VERSION), conn: bagWord(conn), count: bagWord(entries.length) },
      concat(entries.flatMap((entry) => [bagTime(entry.ns), bagWord(entry.offset)])),
    ),
  );
}

function chunkInfo(chunk: ChunkPlan, position: number) {
  const stamps = [...chunk.index.values()].flat().map((entry) => entry.ns);
  const start = stamps.reduce((least, ns) => (ns < least ? ns : least));
  const end = stamps.reduce((most, ns) => (ns > most ? ns : most));
  const counts = [...chunk.index].flatMap(([conn, entries]) => [bagWord(conn), bagWord(entries.length)]);
  const fields = {
    op: bagOp(BAG1_OP.chunkInfo),
    ver: bagWord(INDEX_VERSION),
    chunk_pos: bagLong(BigInt(position)),
    start_time: bagTime(start),
    end_time: bagTime(end),
    count: bagWord(chunk.index.size),
  };

  return bagRecord(fields, concat(counts));
}

function chunkedBody(chunks: ChunkPlan[], compression: 'none' | 'lz4') {
  const parts: Uint8Array[] = [];
  const infos: Uint8Array[] = [];

  for (const chunk of chunks) {
    const records = concat(chunk.records);
    const data = compression === 'lz4' ? lz4FrameStored(records) : records;

    infos.push(chunkInfo(chunk, MAGIC.length + BAG_HEADER_BYTES + lengthOf(parts)));
    parts.push(bagChunk(compression, data, records.length), ...indexRecords(chunk));
  }

  return { parts, infos };
}

export function writeBag1(messages: Bag1FixtureMessage[], options: Bag1FixtureOptions = {}): Uint8Array {
  const chunked = options.chunked ?? Boolean(options.compression);
  const { connections, chunks } = plan(messages, chunked ? (options.chunkSize ?? DEFAULT_CHUNK_BYTES) : Infinity);
  const body = chunked
    ? chunkedBody(chunks, options.compression ?? 'none')
    : { parts: chunks.flatMap((chunk) => chunk.records), infos: [] };
  const index = [...connections.map(bagConnection), ...body.infos];
  const counts = {
    indexPos: MAGIC.length + BAG_HEADER_BYTES + lengthOf(body.parts),
    conns: connections.length,
    chunks: body.infos.length,
  };

  return bagFile([...body.parts, ...index], counts);
}
