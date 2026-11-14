import { McapRecordBuilder, McapWriter, type IWritable } from '@mcap/core';
import { encodeJointState } from './ros2Cdr';

export const JOINT_STATE_SCHEMA = 'sensor_msgs/msg/JointState';
export const COMPRESSED_IMAGE_SCHEMA = 'sensor_msgs/msg/CompressedImage';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const ZSTD_SINGLE_SEGMENT_FOUR_BYTE_SIZE = 0xa0;
const ZSTD_RAW_BLOCK_BYTES = 128 * 1024;

export interface FixtureMessage {
  topic: string;
  schema: string;
  logTime: bigint;
  data: Uint8Array;
}

export interface FixtureOptions {
  chunked?: boolean;
  chunkSize?: number;
  compression?: 'zstd' | 'lz4';
}

class MemoryWritable implements IWritable {
  readonly #parts: Uint8Array[] = [];
  #size = 0;

  write(buffer: Uint8Array) {
    this.#parts.push(buffer.slice());
    this.#size += buffer.byteLength;

    return Promise.resolve();
  }

  position() {
    return BigInt(this.#size);
  }

  bytes() {
    const out = new Uint8Array(this.#size);
    let offset = 0;

    for (const part of this.#parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }

    return out;
  }
}

export function zstdStored(data: Uint8Array): Uint8Array {
  const out: number[] = [...ZSTD_MAGIC, ZSTD_SINGLE_SEGMENT_FOUR_BYTE_SIZE];
  const size = new DataView(new ArrayBuffer(4));

  size.setUint32(0, data.length, true);
  out.push(...new Uint8Array(size.buffer));

  for (let offset = 0; offset === 0 || offset < data.length; offset += ZSTD_RAW_BLOCK_BYTES) {
    const block = data.subarray(offset, offset + ZSTD_RAW_BLOCK_BYTES);
    const header = (block.length << 3) | (offset + ZSTD_RAW_BLOCK_BYTES >= data.length ? 1 : 0);

    out.push(header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff);

    for (const byte of block) out.push(byte);
  }

  return Uint8Array.from(out);
}

const compressors = {
  zstd: (chunkData: Uint8Array) => ({ compression: 'zstd', compressedData: zstdStored(chunkData) }),
  lz4: (chunkData: Uint8Array) => ({ compression: 'lz4', compressedData: chunkData }),
};

async function channelFor(writer: McapWriter, message: FixtureMessage, channels: Map<string, number>) {
  const known = channels.get(message.topic);

  if (known !== undefined) return known;

  const schemaId = await writer.registerSchema({ name: message.schema, encoding: 'ros2msg', data: new Uint8Array() });
  const id = await writer.registerChannel({
    topic: message.topic,
    schemaId,
    messageEncoding: 'cdr',
    metadata: new Map(),
  });

  channels.set(message.topic, id);

  return id;
}

export async function writeMcap(messages: FixtureMessage[], options: FixtureOptions = {}): Promise<Uint8Array> {
  const writable = new MemoryWritable();
  const writer = new McapWriter({
    writable,
    useChunks: options.chunked ?? Boolean(options.compression),
    chunkSize: options.chunkSize,
    compressChunk: options.compression ? compressors[options.compression] : undefined,
  });
  const channels = new Map<string, number>();

  await writer.start({ profile: 'ros2', library: 'basecase-test' });

  for (const [sequence, message] of messages.entries()) {
    const channelId = await channelFor(writer, message, channels);

    await writer.addMessage({
      channelId,
      sequence,
      logTime: message.logTime,
      publishTime: message.logTime,
      data: message.data,
    });
  }

  await writer.end();

  return writable.bytes();
}

export function mcapWithChunk(chunk: { compression: string; uncompressedSize: bigint }): Uint8Array {
  const builder = new McapRecordBuilder();

  builder.writeMagic();
  builder.writeHeader({ profile: 'ros2', library: 'basecase-test' });
  builder.writeChunk({
    messageStartTime: 0n,
    messageEndTime: 0n,
    uncompressedSize: chunk.uncompressedSize,
    uncompressedCrc: 0,
    compression: chunk.compression,
    records: new Uint8Array(64),
  });
  builder.writeDataEnd({ dataSectionCrc: 0 });
  builder.writeFooter({ summaryStart: 0n, summaryOffsetStart: 0n, summaryCrc: 0 });
  builder.writeMagic();

  return builder.buffer.slice();
}

export interface ArmOptions {
  hz: number;
  seconds: number;
  start: number;
  topic?: string;
}

export const ARM_JOINTS = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'];

export const armPose = (time: number) => ARM_JOINTS.map((_, j) => Math.sin(time * (j + 1) * 0.7) * (j + 1) * 0.3);

export function armJointStates(options: ArmOptions): FixtureMessage[] {
  const count = Math.round(options.seconds * options.hz) + 1;

  return Array.from({ length: count }, (_, i) => {
    const time = i / options.hz;
    const stamp = options.start + time;

    return {
      topic: options.topic ?? '/joint_states',
      schema: JOINT_STATE_SCHEMA,
      logTime: BigInt(Math.round(stamp * 1e9)),
      data: encodeJointState({ stamp, name: ARM_JOINTS, position: armPose(time) }),
    };
  });
}
