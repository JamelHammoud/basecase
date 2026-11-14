import { McapStreamReader, type McapTypes, type TypedMcapRecord } from '@mcap/core';
import { decompress } from 'fzstd';
import { decoderFor, type ChannelSchema } from './decode';
import { MCAP_TOO_LARGE } from './decode/limits';
import { lz4Frame } from './lz4';
import { RecordingReader, type RecordingChannel } from './recordingRead';
import { MCAP_DAMAGED } from './ros2Cdr';
import { DataImportError, IMPORT_LIMITS } from './types';

export { MCAP_TOO_LARGE };

export const MCAP_COMPRESSION = 'Only zstd, LZ4 or uncompressed MCAP files open.';

const SLICE_BYTES = 4 * 1024 * 1024;
const COMPRESSIONS = new Set(['', 'zstd', 'lz4']);
const MAX_CHUNK_BYTES = BigInt(IMPORT_LIMITS.chunkBytes);

export interface McapInput {
  name: string;
  bytes: Uint8Array;
}

interface FileState {
  path: string;
  schemas: Map<number, ChannelSchema>;
  channels: Map<number, RecordingChannel>;
  reader: RecordingReader;
}

const damaged = () => new DataImportError(MCAP_DAMAGED);

function inflateZstd(buffer: Uint8Array, size: bigint): Uint8Array {
  if (size > MAX_CHUNK_BYTES) throw new DataImportError(MCAP_TOO_LARGE);

  return decompress(buffer, new Uint8Array(Number(size)));
}

function inflateLz4(buffer: Uint8Array, size: bigint): Uint8Array {
  if (size > MAX_CHUNK_BYTES) throw new DataImportError(MCAP_TOO_LARGE);

  return lz4Frame(buffer, Number(size));
}

function checkChunk(chunk: McapTypes.Chunk) {
  if (!COMPRESSIONS.has(chunk.compression)) throw new DataImportError(MCAP_COMPRESSION);

  if (chunk.uncompressedSize > MAX_CHUNK_BYTES) throw new DataImportError(MCAP_TOO_LARGE);
}

function takeChannel(state: FileState, channel: McapTypes.Channel) {
  const schema = state.schemas.get(channel.schemaId) ?? null;
  const decode = decoderFor(channel.messageEncoding, schema);

  if (!decode) return;

  state.channels.set(channel.id, state.reader.channel(channel.topic, schema?.name ?? '', decode));
}

function takeMessage(state: FileState, message: McapTypes.Message) {
  const channel = state.channels.get(message.channelId);

  if (!channel) return;

  state.reader.message(channel, { path: state.path, logTime: message.logTime, data: message.data });
}

function takeRecord(state: FileState, record: TypedMcapRecord) {
  switch (record.type) {
    case 'Schema':
      state.schemas.set(record.id, { name: record.name, encoding: record.encoding, data: record.data });

      break;
    case 'Channel':
      takeChannel(state, record);

      break;
    case 'Message':
      takeMessage(state, record);

      break;
    case 'Chunk':
      checkChunk(record);

      break;
    default:
      break;
  }
}

function drain(stream: McapStreamReader, state: FileState) {
  for (let record = stream.nextRecord(); record; record = stream.nextRecord()) takeRecord(state, record);
}

export function readMcapInto(reader: RecordingReader, file: McapInput) {
  if (file.bytes.byteLength > IMPORT_LIMITS.fileBytes) throw new DataImportError(MCAP_TOO_LARGE);

  const state: FileState = { path: file.name, schemas: new Map(), channels: new Map(), reader };
  const stream = new McapStreamReader({
    includeChunks: true,
    decompressHandlers: { zstd: inflateZstd, lz4: inflateLz4 },
  });

  try {
    for (let offset = 0; offset < file.bytes.byteLength; offset += SLICE_BYTES) {
      stream.append(file.bytes.subarray(offset, offset + SLICE_BYTES));
      drain(stream, state);
    }
  } catch (error) {
    throw error instanceof DataImportError ? error : damaged();
  }

  if (!stream.done()) throw damaged();
}
