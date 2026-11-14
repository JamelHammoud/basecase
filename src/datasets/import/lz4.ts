import { MCAP_DAMAGED } from './ros2Cdr';
import { DataImportError } from './types';

const FRAME_MAGIC = 0x184d2204;
const SKIPPABLE_MAGIC = 0x184d2a50;
const SKIPPABLE_MASK = 0xfffffff0;
const FRAME_VERSION = 0b01;
const FLAG_INDEPENDENT = 0x20;
const FLAG_BLOCK_CHECKSUM = 0x10;
const FLAG_CONTENT_SIZE = 0x08;
const FLAG_CONTENT_CHECKSUM = 0x04;
const FLAG_RESERVED = 0x02;
const FLAG_DICTIONARY = 0x01;
const BD_RESERVED = 0x8f;
const BLOCK_MAX_BYTES = new Map([
  [4, 64 * 1024],
  [5, 256 * 1024],
  [6, 1024 * 1024],
  [7, 4 * 1024 * 1024],
]);
const STORED_BIT = 0x80000000;
const LENGTH_MASK = 0x7fffffff;
const WORD_BYTES = 4;
const CONTENT_SIZE_BYTES = 8;
const CHECKSUM_BYTES = 4;
const MIN_MATCH = 4;
const RUN_MASK = 15;
const MORE = 255;

interface Source {
  input: Uint8Array;
  at: number;
}

interface Sink {
  out: Uint8Array;
  at: number;
  floor: number;
}

interface FrameHeader {
  independent: boolean;
  blockChecksum: boolean;
  contentChecksum: boolean;
  contentSize: number | null;
  blockMax: number;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

function wordAt(input: Uint8Array, at: number) {
  if (at + WORD_BYTES > input.length) throw damaged();

  return (input[at] | (input[at + 1] << 8) | (input[at + 2] << 16) | (input[at + 3] << 24)) >>> 0;
}

function skip(source: Source, bytes: number) {
  if (source.at + bytes > source.input.length) throw damaged();

  source.at += bytes;
}

function runLength(source: Source, end: number, base: number) {
  let length = base;
  let byte = base === RUN_MASK ? MORE : 0;

  while (byte === MORE) {
    if (source.at >= end) throw damaged();

    byte = source.input[source.at];
    source.at += 1;
    length += byte;
  }

  return length;
}

function copyLiterals(source: Source, end: number, sink: Sink, length: number) {
  if (source.at + length > end || sink.at + length > sink.out.length) throw damaged();

  sink.out.set(source.input.subarray(source.at, source.at + length), sink.at);
  source.at += length;
  sink.at += length;
}

function copyMatch(source: Source, end: number, sink: Sink, field: number) {
  if (source.at + 2 > end) throw damaged();

  const offset = source.input[source.at] | (source.input[source.at + 1] << 8);

  source.at += 2;

  const length = runLength(source, end, field) + MIN_MATCH;
  const from = sink.at - offset;

  if (offset === 0 || from < sink.floor || sink.at + length > sink.out.length) throw damaged();

  if (offset >= length) {
    sink.out.copyWithin(sink.at, from, from + length);
  } else {
    for (let i = 0; i < length; i++) sink.out[sink.at + i] = sink.out[from + i];
  }

  sink.at += length;
}

function decodeBlock(source: Source, end: number, sink: Sink) {
  while (source.at < end) {
    const token = source.input[source.at];

    source.at += 1;
    copyLiterals(source, end, sink, runLength(source, end, token >>> 4));

    if (source.at === end) return;

    copyMatch(source, end, sink, token & RUN_MASK);
  }
}

function contentSizeAt(input: Uint8Array, at: number) {
  const size = wordAt(input, at) + wordAt(input, at + WORD_BYTES) * 2 ** 32;

  if (!Number.isSafeInteger(size)) throw damaged();

  return size;
}

const flagsKnown = (flags: number, descriptor: number) =>
  flags >>> 6 === FRAME_VERSION &&
  (flags & (FLAG_RESERVED | FLAG_DICTIONARY)) === 0 &&
  (descriptor & BD_RESERVED) === 0;

function readFrameHeader(source: Source): FrameHeader {
  if (source.at + WORD_BYTES + 2 > source.input.length) throw damaged();

  const flags = source.input[source.at + WORD_BYTES];
  const descriptor = source.input[source.at + WORD_BYTES + 1];
  const blockMax = BLOCK_MAX_BYTES.get(descriptor >>> 4);

  if (!flagsKnown(flags, descriptor) || blockMax === undefined) throw damaged();

  const hasContentSize = (flags & FLAG_CONTENT_SIZE) !== 0;
  const contentSize = hasContentSize ? contentSizeAt(source.input, source.at + WORD_BYTES + 2) : null;

  skip(source, WORD_BYTES + 2 + (hasContentSize ? CONTENT_SIZE_BYTES : 0) + 1);

  return {
    independent: (flags & FLAG_INDEPENDENT) !== 0,
    blockChecksum: (flags & FLAG_BLOCK_CHECKSUM) !== 0,
    contentChecksum: (flags & FLAG_CONTENT_CHECKSUM) !== 0,
    contentSize,
    blockMax,
  };
}

function readBlock(source: Source, sink: Sink, frame: FrameHeader) {
  const word = wordAt(source.input, source.at);

  source.at += WORD_BYTES;

  if (word === 0) return false;

  const length = word & LENGTH_MASK;
  const end = source.at + length;

  if (length > frame.blockMax || end > source.input.length) throw damaged();

  if (frame.independent) sink.floor = sink.at;

  if (word >= STORED_BIT) {
    copyLiterals(source, end, sink, length);
  } else {
    decodeBlock(source, end, sink);
  }

  if (frame.blockChecksum) skip(source, CHECKSUM_BYTES);

  return true;
}

function readFrame(source: Source, sink: Sink) {
  const start = sink.at;
  const frame = readFrameHeader(source);

  if (frame.contentSize !== null && frame.contentSize > sink.out.length - start) throw damaged();

  sink.floor = start;

  let more = true;

  while (more) more = readBlock(source, sink, frame);

  if (frame.contentChecksum) skip(source, CHECKSUM_BYTES);

  if (frame.contentSize !== null && sink.at - start !== frame.contentSize) throw damaged();
}

function readNext(source: Source, sink: Sink) {
  const magic = wordAt(source.input, source.at);

  if ((magic & SKIPPABLE_MASK) >>> 0 === SKIPPABLE_MAGIC) {
    skip(source, 2 * WORD_BYTES + wordAt(source.input, source.at + WORD_BYTES));

    return;
  }

  if (magic !== FRAME_MAGIC) throw damaged();

  readFrame(source, sink);
}

function sinkOf(size: number): Sink {
  if (!Number.isSafeInteger(size) || size < 0) throw damaged();

  return { out: new Uint8Array(size), at: 0, floor: 0 };
}

export function lz4Frame(input: Uint8Array, size: number): Uint8Array {
  const sink = sinkOf(size);
  const source: Source = { input, at: 0 };

  if (input.length === 0) throw damaged();

  while (source.at < input.length) readNext(source, sink);

  if (sink.at !== size) throw damaged();

  return sink.out;
}

export function lz4Block(input: Uint8Array, size: number): Uint8Array {
  const sink = sinkOf(size);

  decodeBlock({ input, at: 0 }, input.length, sink);

  if (sink.at !== size) throw damaged();

  return sink.out;
}
