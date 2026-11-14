import { describe, expect, it } from 'vitest';
import { descriptorSet, encodeProtobuf, PROTO_TYPES, protobufSchema, ProtoWriter } from './fixtures';
import { MCAP_DAMAGED } from '../ros2Cdr';
import { decoderFor, type MessageDecoder } from './index';

const decoderOf = (name: string, data = protobufSchema()): MessageDecoder => {
  const decode = decoderFor('protobuf', { name, encoding: 'protobuf', data });

  if (!decode) throw new Error('No decoder');

  return decode;
};

const MIXED_SCHEMA = descriptorSet([
  {
    name: 'mixed.proto',
    package: 'test',
    messages: [
      {
        name: 'Mixed',
        fields: [
          { name: 'values', number: 1, type: PROTO_TYPES.double, repeated: true },
          { name: 'deltas', number: 2, type: PROTO_TYPES.sint32, repeated: true },
          { name: 'tags', number: 3, type: PROTO_TYPES.string, repeated: true },
          { name: 'blob', number: 4, type: PROTO_TYPES.bytes },
          { name: 'flag', number: 5, type: PROTO_TYPES.bool },
          { name: 'negative', number: 6, type: PROTO_TYPES.int32 },
          { name: 'items', number: 7, type: PROTO_TYPES.message, typeName: '.test.Mixed.Item', repeated: true },
          { name: 'wide', number: 8, type: PROTO_TYPES.sint64 },
          { name: 'count', number: 9, type: PROTO_TYPES.uint64 },
          { name: 'choice', number: 10, type: PROTO_TYPES.string, oneof: true },
          { name: 'flags', number: 11, type: PROTO_TYPES.bool, repeated: true },
          { name: 'single', number: 12, type: PROTO_TYPES.float },
          { name: 'signed', number: 13, type: PROTO_TYPES.sfixed64 },
        ],
        nested: [{ name: 'Item', fields: [{ name: 'id', number: 1, type: PROTO_TYPES.uint32 }] }],
      },
    ],
  },
]);

const MIXED = {
  values: Float64Array.from([1.5, -2, Number.NaN]),
  deltas: Float64Array.from([-1, 0, 70_000, -2_147_483_648]),
  tags: ['a', 'b'],
  blob: Uint8Array.from([1, 2, 3]),
  flag: true,
  negative: -42,
  items: [{ id: 1 }, { id: 0 }],
  wide: -(2 ** 40),
  count: 2 ** 50,
  flags: Float64Array.from([1, 0]),
  single: Infinity,
  signed: -7,
};

describe('protobuf decoding', () => {
  it('round-trips a foxglove.PoseInFrame', () => {
    const value = {
      timestamp: { seconds: 1_700_000_000, nanos: 5 },
      frame_id: 'map',
      pose: { position: { x: 1, y: -2, z: 3 }, orientation: { x: 0, y: 0, z: 0.6, w: 0.8 } },
    };

    expect(decoderOf('foxglove.PoseInFrame')(encodeProtobuf('foxglove.PoseInFrame', value))).toEqual(value);
  });

  it('round-trips a foxglove.Log with its level as a number', () => {
    const value = {
      timestamp: { seconds: 3, nanos: 0 },
      level: 4,
      message: 'motor stalled',
      name: 'driver',
      file: 'driver.cc',
      line: 120,
    };

    expect(decoderOf('foxglove.Log')(encodeProtobuf('foxglove.Log', value))).toEqual(value);
  });

  it('fills absent scalars with their defaults and leaves absent messages out, in field order', () => {
    const decoded = decoderOf('foxglove.Log')(new Uint8Array());

    expect(decoded).toEqual({ level: 0, message: '', name: '', file: '', line: 0 });
    expect(Object.keys(decoded)).toEqual(['level', 'message', 'name', 'file', 'line']);
  });

  it.each([
    ['packed', true],
    ['unpacked', false],
  ])('reads %s repeated fields, zigzag, 64-bit and oneof fields', (_, packed) => {
    const bytes = encodeProtobuf('test.Mixed', MIXED, { schema: MIXED_SCHEMA, packed });

    expect(decoderOf('.test.Mixed', MIXED_SCHEMA)(bytes)).toEqual(MIXED);
  });

  it('gives absent repeated fields an empty array of the right kind and skips unknown fields', () => {
    const unknown = new ProtoWriter()
      .tag(99, 0)
      .varint(5)
      .string(98, 'ignored')
      .tag(97, 1)
      .fixed(8, (view) => view.setFloat64(0, 1, true))
      .bytes();
    const decoded = decoderOf('test.Mixed', MIXED_SCHEMA)(unknown);

    expect(decoded).toMatchObject({ values: new Float64Array(), tags: [], items: [], flags: new Float64Array() });
    expect(decoded).not.toHaveProperty('choice');
  });

  it('refuses a message whose field arrives with the wrong wire type', () => {
    const bytes = new ProtoWriter().string(5, 'not a bool').bytes();

    expect(() => decoderOf('test.Mixed', MIXED_SCHEMA)(bytes)).toThrow(MCAP_DAMAGED);
  });

  it('refuses a group as damaged', () => {
    const bytes = new ProtoWriter().tag(50, 3).tag(50, 4).bytes();

    expect(() => decoderOf('test.Mixed', MIXED_SCHEMA)(bytes)).toThrow(MCAP_DAMAGED);
  });

  it('refuses a schema that doesn’t define the channel’s message', () => {
    expect(() => decoderOf('foxglove.Missing')).toThrow('This recording’s message schema can’t be read.');
  });
});

describe('JSON decoding', () => {
  const decode = (value: unknown, schema: 'none' | 'jsonschema' | '' = 'none') => {
    const data = new TextEncoder().encode(JSON.stringify(value));
    const channel = schema === 'none' ? null : { name: 'Thing', encoding: schema, data: new Uint8Array() };

    return decoderFor('json', channel)?.(data);
  };

  it('keeps nested objects and turns number arrays into Float64Array', () => {
    const value = { pose: { position: [1, 2, 3], frame: 'map' }, tags: ['a', 1], ok: true, gap: null };

    expect(decode(value)).toEqual({
      pose: { position: Float64Array.from([1, 2, 3]), frame: 'map' },
      tags: ['a', 1],
      ok: true,
      gap: null,
    });
    expect(Object.keys(decode(value, 'jsonschema') ?? {})).toEqual(['pose', 'tags', 'ok', 'gap']);
    expect(decode(value, '')).toBeDefined();
  });

  it('refuses text that isn’t a JSON object', () => {
    const decoder = decoderFor('json', null);

    expect(() => decoder?.(new TextEncoder().encode('[1, 2]'))).toThrow(MCAP_DAMAGED);
    expect(() => decoder?.(new TextEncoder().encode('{"a": '))).toThrow(MCAP_DAMAGED);
  });

  it('keeps a __proto__ key as data', () => {
    const decoded = decoderFor('json', null)?.(new TextEncoder().encode('{"__proto__": {"polluted": 1}}'));

    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded ?? {}, '__proto__')).toBe(true);
  });
});

describe('decoderFor', () => {
  it('skips encodings it can’t decode', () => {
    const data = new Uint8Array([1]);

    expect(decoderFor('flatbuffer', { name: 'T', encoding: 'flatbuffer', data })).toBeNull();
    expect(decoderFor('cdr', { name: 'T', encoding: 'ros2idl', data })).toBeNull();
    expect(decoderFor('cdr', null)).toBeNull();
    expect(decoderFor('json', { name: 'T', encoding: 'protobuf', data })).toBeNull();
    expect(decoderFor('protobuf', { name: 'T', encoding: 'jsonschema', data })).toBeNull();
  });
});
