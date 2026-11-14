import { TOPIC_LIMITS, type Ragged, type RaggedBytes, type RecordedTopic, type TopicLog } from './topicLog';

const MAGIC = 0x4c544342;
const VERSION = 1;
const PREAMBLE = 12;
const MAX_HEADER = 16 * 1024 * 1024;

interface TopicHeader {
  topic: string;
  schema: string;
  count: number;
  clipped: boolean;
  numbers: string[];
  labels: Array<[string, number]>;
  lists: Array<[string, number]>;
  blobs: Array<[string, number]>;
}

const align8 = (n: number) => Math.ceil(n / 8) * 8;

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

function labelBytes(labels: string[]) {
  const encoder = new TextEncoder();
  const parts = labels.map((s) => encoder.encode(s));
  const at = new Uint32Array(labels.length + 1);

  parts.forEach((p, i) => {
    at[i + 1] = at[i] + p.length;
  });

  const bytes = new Uint8Array(at[labels.length]);

  parts.forEach((p, i) => bytes.set(p, at[i]));

  return { at, bytes };
}

function topicSections(topic: RecordedTopic) {
  const labels = [...topic.labels].map(([path, values]) => [path, labelBytes(values)] as const);
  const header: TopicHeader = {
    topic: topic.topic,
    schema: topic.schema,
    count: topic.t.length,
    clipped: topic.clipped,
    numbers: [...topic.numbers.keys()],
    labels: labels.map(([path, l]) => [path, l.bytes.length]),
    lists: [...topic.lists].map(([path, l]) => [path, l.v.length]),
    blobs: [...topic.blobs].map(([path, b]) => [path, b.bytes.length]),
  };
  const chunks: ArrayBufferView[] = [
    topic.t,
    ...topic.numbers.values(),
    ...labels.flatMap(([, l]) => [l.at, l.bytes]),
    ...[...topic.lists.values()].flatMap((l) => [l.at, l.v]),
    ...[...topic.blobs.values()].flatMap((b) => [b.at, b.bytes]),
  ];

  return { header, chunks };
}

export function encodeTopicLog(log: TopicLog): Uint8Array {
  const sections = log.topics.map(topicSections);
  const header = new TextEncoder().encode(JSON.stringify({ topics: sections.map((s) => s.header) }));
  const chunks = sections.flatMap((s) => s.chunks);
  const start = align8(PREAMBLE + header.length);
  const total = chunks.reduce((at, c) => align8(at + c.byteLength), start);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, header.length, true);
  out.set(header, PREAMBLE);

  let at = start;

  for (const chunk of chunks) {
    out.set(bytesOf(chunk), at);
    at = align8(at + chunk.byteLength);
  }

  return out;
}

class Cursor {
  at: number;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array, start: number) {
    this.bytes = bytes;
    this.at = start;
  }

  take(size: number): Uint8Array {
    if (!Number.isInteger(size) || size < 0 || this.at + size > this.bytes.byteLength) throw new RangeError();

    const out = this.bytes.subarray(this.at, this.at + size);

    this.at = align8(this.at + size);

    return out;
  }

  f64(count: number) {
    const raw = this.take(count * 8);

    return new Float64Array(raw.buffer, raw.byteOffset, count);
  }

  offsets(count: number, total: number) {
    const raw = this.take((count + 1) * 4);
    const at = new Uint32Array(raw.buffer, raw.byteOffset, count + 1);

    for (let i = 0; i < count; i++) if (at[i + 1] < at[i]) throw new RangeError();

    if (at[0] !== 0 || at[count] !== total) throw new RangeError();

    return at;
  }
}

const isText = (v: unknown, max = TOPIC_LIMITS.pathChars * 4): v is string => typeof v === 'string' && v.length <= max;

const isCount = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

const isSized = (v: unknown): v is [string, number] => Array.isArray(v) && isText(v[0]) && isCount(v[1]);

function isHeader(v: unknown): v is TopicHeader {
  if (typeof v !== 'object' || v === null) return false;

  const h = v as TopicHeader;
  const lists = [h.labels, h.lists, h.blobs];

  return (
    isText(h.topic, 1024) &&
    isText(h.schema, 1024) &&
    isCount(h.count, TOPIC_LIMITS.messages) &&
    typeof h.clipped === 'boolean' &&
    Array.isArray(h.numbers) &&
    h.numbers.every((p) => isText(p)) &&
    lists.every((l) => Array.isArray(l) && l.every(isSized))
  );
}

function readTopic(h: TopicHeader, cursor: Cursor): RecordedTopic {
  const decoder = new TextDecoder();
  const t = cursor.f64(h.count);
  const numbers = new Map(h.numbers.map((path) => [path, cursor.f64(h.count)]));
  const labels = new Map(
    h.labels.map(([path, size]) => {
      const at = cursor.offsets(h.count, size);
      const bytes = cursor.take(size);

      return [path, Array.from({ length: h.count }, (_, i) => decoder.decode(bytes.subarray(at[i], at[i + 1])))];
    }),
  );
  const lists = new Map<string, Ragged>(
    h.lists.map(([path, size]) => [path, { at: cursor.offsets(h.count, size), v: cursor.f64(size) }]),
  );
  const blobs = new Map<string, RaggedBytes>(
    h.blobs.map(([path, size]) => [path, { at: cursor.offsets(h.count, size), bytes: cursor.take(size) }]),
  );

  return { topic: h.topic, schema: h.schema, t, numbers, labels, lists, blobs, clipped: h.clipped };
}

function readHeader(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, true);

  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;

  if (length > MAX_HEADER || PREAMBLE + length > bytes.byteLength) return null;

  return JSON.parse(new TextDecoder().decode(bytes.subarray(PREAMBLE, PREAMBLE + length)));
}

export function decodeTopicLog(given: Uint8Array): TopicLog | null {
  if (given.byteLength < PREAMBLE) return null;

  const bytes = given.byteOffset % 8 === 0 ? given : given.slice();

  try {
    const header = readHeader(bytes) as { topics?: unknown } | null;
    const topics = header?.topics;

    if (!Array.isArray(topics) || topics.length > TOPIC_LIMITS.topics || !topics.every(isHeader)) return null;

    const cursor = new Cursor(
      bytes,
      align8(PREAMBLE + new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true)),
    );

    return { topics: topics.map((h) => readTopic(h, cursor)) };
  } catch {
    return null;
  }
}
