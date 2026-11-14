import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MCAP_TOO_LARGE } from './decode/limits';
import { lz4Frame } from './lz4';
import { MCAP_DAMAGED } from './ros2Cdr';
import { BAG1_COMPRESSION, BAG1_OP, isBagName, readBag1, type BagConnection, type BagMessage } from './rosbag1';
import {
  bagChunk,
  bagConnection,
  bagFields,
  bagFile,
  bagMessage,
  bagOp,
  bagRecord,
  bagTime,
  bagWord,
  writeBag1,
  type Bag1FixtureMessage,
  type Bag1FixtureOptions,
} from './rosbag1Fixtures';
import { DataImportError } from './types';

vi.mock('./lz4', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lz4')>();

  return { ...actual, lz4Frame: vi.fn(actual.lz4Frame) };
});

const JOINT_STATE = 'sensor_msgs/JointState';
const IMAGE = 'sensor_msgs/CompressedImage';
const JOINT_DEFINITION = 'Header header\nstring[] name\nfloat64[] position\n';
const IMAGE_DEFINITION = 'Header header\nstring format\nuint8[] data\n';

const message = (topic: string, ns: bigint, payload: number): Bag1FixtureMessage => ({
  topic,
  type: topic === '/joint_states' ? JOINT_STATE : IMAGE,
  definition: topic === '/joint_states' ? JOINT_DEFINITION : IMAGE_DEFINITION,
  ns,
  data: Uint8Array.from({ length: 40 + payload }, (_, i) => (payload + i) & 0xff),
});

const MESSAGES = Array.from({ length: 300 }, (_, i) =>
  message(
    i % 3 === 2 ? '/camera/image/compressed' : '/joint_states',
    1_700_000_000_000_000_000n + BigInt(i) * 10_000_000n,
    i,
  ),
);

function collect(bytes: Uint8Array) {
  const connections: BagConnection[] = [];
  const messages: BagMessage[] = [];

  readBag1(bytes, { connection: (c) => connections.push(c), message: (m) => messages.push(m) });

  return { connections, messages };
}

function refusal(bytes: Uint8Array) {
  try {
    collect(bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(DataImportError);

    return (error as Error).message;
  }

  return null;
}

const INDEX_POS_AT = 39;

const jointConnection = { id: 0, topic: '/joint_states', type: JOINT_STATE, definition: JOINT_DEFINITION };

const bagOf = (...records: Uint8Array[]) => bagFile([bagConnection(jointConnection), ...records]);

beforeEach(() => {
  vi.mocked(lz4Frame).mockClear();
});

describe('readBag1', () => {
  it.each<[string, Bag1FixtureOptions]>([
    ['unchunked', { chunked: false }],
    ['chunked, uncompressed', { chunked: true, chunkSize: 2048 }],
    ['chunked, LZ4', { compression: 'lz4', chunkSize: 2048 }],
  ])('reads every message back in order, each connection once (%s)', (_, options) => {
    const { connections, messages } = collect(writeBag1(MESSAGES, options));
    const topics = new Map(connections.map((c) => [c.id, c.topic]));

    expect(connections).toEqual([
      { id: 0, topic: '/joint_states', type: JOINT_STATE, definition: JOINT_DEFINITION },
      { id: 1, topic: '/camera/image/compressed', type: IMAGE, definition: IMAGE_DEFINITION },
    ]);
    expect(messages).toHaveLength(MESSAGES.length);
    messages.forEach((read, i) => {
      expect(topics.get(read.conn)).toBe(MESSAGES[i].topic);
      expect(read.ns).toBe(MESSAGES[i].ns);
      expect(read.data).toEqual(MESSAGES[i].data);
    });
  });

  it.each([false, true])('points the fixture’s bag header at its index section (chunked: %s)', (chunked) => {
    const bytes = writeBag1(MESSAGES, { chunked });
    const indexPos = Number(new DataView(bytes.buffer).getBigUint64(INDEX_POS_AT, true));

    expect(String.fromCharCode(...bytes.subarray(indexPos + 8, indexPos + 12))).toBe(`op=${String.fromCharCode(7)}`);
  });

  it('decompresses LZ4 chunks', () => {
    collect(writeBag1(MESSAGES, { compression: 'lz4', chunkSize: 2048 }));

    expect(lz4Frame).toHaveBeenCalled();
  });

  it('skips a message whose connection it hasn’t seen', () => {
    const stray = bagMessage(7, { ns: 5n, data: Uint8Array.of(1) });
    const known = bagMessage(0, { ns: 6n, data: Uint8Array.of(2) });
    const { messages } = collect(bagOf(stray, known));

    expect(messages).toEqual([{ conn: 0, ns: 6n, data: Uint8Array.of(2) }]);
  });

  it('refuses a message declaring 2 GB before reading it', () => {
    const huge = bagRecord(
      { op: bagOp(BAG1_OP.message), conn: bagWord(0), time: bagTime(0n) },
      new Uint8Array(),
      2 ** 31,
    );

    expect(refusal(bagOf(huge))).toBe(MCAP_TOO_LARGE);
  });

  it('refuses a chunk declaring more than the cap before inflating it', () => {
    expect(refusal(bagOf(bagChunk('lz4', new Uint8Array(16), 0xffffffff)))).toBe(MCAP_TOO_LARGE);
    expect(refusal(bagOf(bagChunk('none', new Uint8Array(16), 0xffffffff)))).toBe(MCAP_TOO_LARGE);
    expect(lz4Frame).not.toHaveBeenCalled();
  });

  it('refuses a chunk size wider than its field, like 100 GB', () => {
    const wide = bagRecord(
      { op: bagOp(BAG1_OP.chunk), compression: 'none', size: Uint8Array.of(0, 0, 0, 0x48, 0x17, 0, 0, 0) },
      new Uint8Array(16),
    );

    expect(refusal(bagOf(wide))).toBe(MCAP_DAMAGED);
  });

  it('refuses bz2 chunks', () => {
    expect(refusal(bagOf(bagChunk('bz2', new Uint8Array(16))))).toBe(BAG1_COMPRESSION);
  });

  it('refuses a chunk inside a chunk', () => {
    const inner = bagChunk('none', bagMessage(0, { ns: 1n, data: Uint8Array.of(1) }));

    expect(refusal(bagOf(bagChunk('none', inner)))).toBe(MCAP_DAMAGED);
  });

  it('refuses a truncated bag, wrong magic, wrong version and an empty file', () => {
    const whole = writeBag1(MESSAGES, { compression: 'lz4', chunkSize: 2048 });
    const renamed = (magic: string) => Uint8Array.from([...new TextEncoder().encode(magic), ...whole.subarray(13)]);

    expect(refusal(whole.subarray(0, whole.length - 3))).toBe(MCAP_DAMAGED);
    expect(refusal(whole.subarray(0, 5000))).toBe(MCAP_DAMAGED);
    expect(refusal(renamed('#ROSBAG V1.2\n'))).toBe(MCAP_DAMAGED);
    expect(refusal(renamed('#ROSBAG_V2.0\n'))).toBe(MCAP_DAMAGED);
    expect(refusal(new Uint8Array())).toBe(MCAP_DAMAGED);
  });

  it('refuses records missing required fields or carrying oversized ones', () => {
    const noTime = bagRecord({ op: bagOp(BAG1_OP.message), conn: bagWord(0) }, Uint8Array.of(1));
    const noType = bagRecord(
      { op: bagOp(BAG1_OP.connection), conn: bagWord(1), topic: '/a' },
      bagFields({ md5sum: '*', message_definition: '' }),
    );
    const longDefinition = bagConnection({ ...jointConnection, id: 2, definition: 'x'.repeat(1024 * 1024 + 1) });
    const hugeHeader = Uint8Array.from([...bagWord(2 * 1024 * 1024), ...new Uint8Array(16)]);

    expect(refusal(bagOf(noTime))).toBe(MCAP_DAMAGED);
    expect(refusal(bagOf(noType))).toBe(MCAP_DAMAGED);
    expect(refusal(bagOf(longDefinition))).toBe(MCAP_DAMAGED);
    expect(refusal(bagOf(hugeHeader))).toBe(MCAP_DAMAGED);
    expect(refusal(bagOf(bagRecord({ op: bagOp(0x09) }, new Uint8Array())))).toBe(MCAP_DAMAGED);
  });
});

describe('isBagName', () => {
  it('matches .bag files only', () => {
    expect(['run.bag', 'RUN.BAG'].map(isBagName)).toEqual([true, true]);
    expect(['run.mcap', 'run.bag.zip', 'bag'].map(isBagName)).toEqual([false, false, false]);
  });
});
