import { Builder, ByteBuffer } from 'flatbuffers';
import { describe, expect, it } from 'vitest';
import { TopicCollector } from '../../../topics/collector';
import { messageAt, messageTree } from '../../../topics/messageTree';
import { decodeTopicLog, encodeTopicLog } from '../../../topics/topicFile';
import { TopicIndex } from '../../../topics/topicIndex';
import { stateSpans } from '../../../topics/states';
import { decoderFor, DECODE_LIMITS, SCHEMA_REFUSED } from './index';
import {
  FB,
  flatNested,
  flatSchema,
  flatTelemetry,
  TELEMETRY_OBJECTS,
  TELEMETRY_ENUMS,
  telemetrySchema,
} from './flatFixtures';

const decoder = (name = 'robot.Telemetry', data = telemetrySchema()) =>
  decoderFor('flatbuffer', { name, encoding: 'flatbuffer', data })!;

describe('FlatBuffers recording messages', () => {
  it('reads official writer output with nested tables, inline struct vectors, bytes, enums, unions and defaults', () => {
    const bytes = flatTelemetry();
    const official = new ByteBuffer(bytes);
    const root = official.readInt32(0);
    const field = official.__offset(root, 8);
    const nested = official.__indirect(root + field);
    const text = official.__string(nested + official.__offset(nested, 4));

    expect(decoder()(bytes)).toEqual({
      volts: 12.5,
      mode: 'Idle',
      nested: { name: text },
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 1.5 },
      ],
      bytes: Uint8Array.from([0, 255, 0]),
      signed: 0,
      unsigned: 0,
      optional: null,
      choice_type: 'Nested',
      choice: { name: 'wrist-0' },
    });
  });

  it('resolves two named roots from identical schema content', () => {
    const schema = telemetrySchema();
    const { b, offset } = flatNested('second root');

    b.finish(offset);
    expect(decoder('robot.Nested', schema.slice())(b.asUint8Array())).toEqual({ name: 'second root' });
    expect(decoder('robot.Telemetry', schema)(flatTelemetry(1))).toMatchObject({ volts: 11.5, mode: 'Moving' });
    expect(() => decoder('robot.Missing', schema)).toThrow(SCHEMA_REFUSED);
    expect(() => decoder('robot.Point', schema)).toThrow(SCHEMA_REFUSED);
  });

  it('keeps exact 64-bit boundaries through topic storage, Message and State, excluding them from plots', () => {
    const collector = new TopicCollector();

    for (const i of [0, 1])
      collector.add('/telemetry', 'robot.Telemetry', BigInt(i) * 1_000_000_000n, decoder()(flatTelemetry(i, true)));

    const log = decodeTopicLog(encodeTopicLog(collector.finish(0n)))!;
    const topic = log.topics[0];
    const index = new TopicIndex(log);

    expect(messageAt(topic, 0)).toMatchObject({ signed: '-9223372036854775808', unsigned: '18446744073709551615' });
    expect(messageTree(topic, 0)).toContainEqual({ key: 'unsigned', value: '18446744073709551615' });
    expect(index.series('topic./telemetry.unsigned')).toEqual({ t: [], v: [] });
    expect(index.series('topic./telemetry.volts').v).toEqual([12.5, 11.5]);
    expect(stateSpans(topic.t, topic.labels.get('mode')!, 2).map((s) => s.value)).toEqual(['Idle', 'Moving']);
    expect(topic.blobs.get('bytes')!.bytes).toEqual(Uint8Array.from([0, 255, 0, 0, 255, 1]));
    expect(messageAt(topic, 1).points).toEqual([
      { x: 1, y: 1.5 },
      { x: 2, y: 2.5 },
    ]);
  });

  it('keeps a field readable when it crosses the numeric plot range', () => {
    const collector = new TopicCollector();

    collector.add('/telemetry', 'robot.Telemetry', 0n, {
      ...decoder()(flatTelemetry(1)),
      unsigned: Number.MAX_SAFE_INTEGER,
    });
    collector.add('/telemetry', 'robot.Telemetry', 1_000_000_000n, decoder()(flatTelemetry(2, true)));

    const log = decodeTopicLog(encodeTopicLog(collector.finish(0n)))!;
    const index = new TopicIndex(log);
    const id = 'topic./telemetry.unsigned';

    expect(messageAt(log.topics[0], 0).unsigned).toBe(Number.MAX_SAFE_INTEGER);
    expect(messageTree(log.topics[0], 0)).toContainEqual({ key: 'unsigned', value: '9007199254740991' });
    expect(messageAt(log.topics[0], 1).unsigned).toBe('18446744073709551615');
    expect(index.valueAt(id, 1)).toEqual(['18446744073709551615']);
    expect(index.series(id).v).toEqual([Number.MAX_SAFE_INTEGER, NaN]);
    expect(index.labels(id)?.v).toEqual(['9007199254740991', '18446744073709551615']);
    expect(index.listed().filter((signal) => signal === id)).toEqual([id]);
    expect(index.expand('topic./telemetry.*').filter((signal) => signal === id)).toEqual([id]);
  });

  it('reads absent references and scalar defaults and string union alternatives', () => {
    const b = new Builder(64);
    const text = b.createString('union text');

    b.startObject(10);
    b.addFieldInt8(8, 2, 0);
    b.addFieldOffset(9, text, 0);
    b.finish(b.endObject());
    expect(decoder()(b.asUint8Array())).toMatchObject({
      volts: 12.5,
      nested: null,
      bytes: null,
      points: null,
      choice_type: 'Text',
      choice: 'union text',
    });
  });
});

describe('FlatBuffers union payloads across a recording', () => {
  it('keeps present empty vectors through topic storage', () => {
    const schema = flatSchema([
      {
        name: 'Root',
        fields: [
          { name: 'values', id: 0, type: { base: FB.vector, element: FB.double } },
          { name: 'names', id: 1, type: { base: FB.vector, element: FB.string } },
        ],
      },
    ]);
    const b = new Builder(64);

    b.startVector(8, 0, 8);

    const empty = b.endVector();

    b.startObject(2);
    b.addFieldOffset(0, empty, 0);
    b.addFieldOffset(1, empty, 0);
    b.finish(b.endObject());

    const collector = new TopicCollector();

    collector.add('/empty', 'Root', 0n, decoder('Root', schema)(b.asUint8Array()));

    const topic = decodeTopicLog(encodeTopicLog(collector.finish(0n)))!.topics[0];

    expect(messageAt(topic, 0)).toEqual({ values: new Float64Array(), names: new Float64Array() });
  });

  it('keeps table, string and empty-string alternatives after storage', () => {
    const collector = new TopicCollector();

    collector.add('/telemetry', 'robot.Telemetry', 0n, decoder()(flatTelemetry()));

    for (const [i, text] of ['changed', ''].entries()) {
      const b = new Builder(64);
      const payload = b.createString(text);

      b.startObject(10);
      b.addFieldInt8(8, 2, 0);
      b.addFieldOffset(9, payload, 0);
      b.finish(b.endObject());
      collector.add('/telemetry', 'robot.Telemetry', BigInt(i + 1), decoder()(b.asUint8Array()));
    }

    const bytes = encodeTopicLog(collector.finish(0n));
    const topic = decodeTopicLog(bytes)!.topics[0];

    expect(messageAt(topic, 0)).toMatchObject({ choice_type: 'Nested', choice: { name: 'wrist-0' } });
    expect(messageAt(topic, 1)).toMatchObject({ choice_type: 'Text', choice: 'changed' });
    expect(messageAt(topic, 2)).toMatchObject({ choice_type: 'Text', choice: '' });
    expect(encodeTopicLog({ topics: [topic] })).toEqual(bytes);
  });
});

describe('FlatBuffers bounds and hostile data', () => {
  it('keeps hostile field names as data through topic storage and Message', () => {
    const schema = flatSchema([
      { name: 'Root', fields: [{ name: '__proto__', id: 0, type: { base: FB.obj, index: 1 } }] },
      { name: 'Child', fields: [{ name: 'name', id: 0, type: { base: FB.string } }] },
    ]);
    const b = new Builder(64);
    const nested = flatNested('schema data', b).offset;

    b.startObject(1);
    b.addFieldOffset(0, nested, 0);
    b.finish(b.endObject());

    const message = decoder('Root', schema)(b.asUint8Array());
    const collector = new TopicCollector();

    collector.add('/hostile', 'Root', 0n, message);

    const topic = decodeTopicLog(encodeTopicLog(collector.finish(0n)))!.topics[0];
    const rebuilt = messageAt(topic, 0);

    expect(Object.getPrototypeOf(rebuilt)).toBe(Object.prototype);
    expect(Object.hasOwn(rebuilt, '__proto__')).toBe(true);
    expect(rebuilt['__proto__']).toEqual({ name: 'schema data' });
    expect(Object.hasOwn(Object.prototype, 'name')).toBe(false);
  });

  it('refuses malformed supported schemas and invalid references', () => {
    expect(() => decoder('T', new Uint8Array([1]))).toThrow(SCHEMA_REFUSED);

    const objects = structuredClone(TELEMETRY_OBJECTS);

    objects[0].fields[2].type.index = 999;
    expect(() => decoder('robot.Telemetry', flatSchema(objects, TELEMETRY_ENUMS))).toThrow(SCHEMA_REFUSED);
  });

  it('refuses truncated messages, forged offsets and oversized vectors before allocation', () => {
    const bytes = flatTelemetry();

    expect(() => decoder()(bytes.subarray(0, 7))).toThrow();

    const forged = bytes.slice();

    new DataView(forged.buffer).setUint32(0, 0xfffffff0, true);
    expect(() => decoder()(forged)).toThrow();

    const huge = bytes.slice();
    const b = new ByteBuffer(huge);
    const root = b.readInt32(0);
    const vector = b.__vector(root + b.__offset(root, 10));

    new DataView(huge.buffer).setUint32(vector - 4, DECODE_LIMITS.items + 1, true);
    expect(() => decoder()(huge)).toThrow();
  });

  it('bounds recursive message depth', () => {
    const schema = flatSchema([{ name: 'Node', fields: [{ name: 'next', id: 0, type: { base: FB.obj, index: 0 } }] }]);
    const b = new Builder(1024);
    let previous = 0;

    for (let i = 0; i < DECODE_LIMITS.depth + 2; i++) {
      b.startObject(1);
      b.addFieldOffset(0, previous, 0);
      previous = b.endObject();
    }

    b.finish(previous);
    expect(() => decoder('Node', schema)(b.asUint8Array())).toThrow(SCHEMA_REFUSED);
  });
});
