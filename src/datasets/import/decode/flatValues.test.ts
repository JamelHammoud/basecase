import { Builder, ByteBuffer } from 'flatbuffers';
import { describe, expect, it } from 'vitest';
import { decoderFor, DECODE_LIMITS, SCHEMA_REFUSED } from './index';
import { FB, flatNested, flatSchema } from './flatFixtures';
import { parseFlatSchema } from './flatSchema';

const decode = (schema: Uint8Array, bytes: Uint8Array) =>
  decoderFor('flatbuffer', { name: 'Root', encoding: 'flatbuffer', data: schema })!(bytes);

const UNION_SCHEMA = flatSchema(
  [
    {
      name: 'Root',
      fields: [
        { name: 'choices_type', id: 0, type: { base: FB.vector, element: FB.utype, index: 0 } },
        { name: 'choices', id: 1, type: { base: FB.vector, element: FB.union, index: 0 } },
      ],
    },
    { name: 'Child', fields: [{ name: 'name', id: 0, type: { base: FB.string } }] },
  ],
  [
    {
      name: 'Choice',
      base: FB.utype,
      union: true,
      values: [
        { name: 'NONE', value: 0n },
        { name: 'Text', value: 1n, type: { base: FB.string } },
        { name: 'Child', value: 2n, type: { base: FB.obj, index: 1 } },
      ],
    },
  ],
);

function unionVector() {
  const b = new Builder(128);
  const child = flatNested('child', b).offset;
  const text = b.createString('text');

  b.startVector(4, 3, 4);
  b.addOffset(child);
  b.addOffset(text);
  b.writeInt32(0);

  const values = b.endVector();
  const tags = b.createByteVector(Uint8Array.from([0, 1, 2]));

  b.startObject(2);
  b.addFieldOffset(0, tags, 0);
  b.addFieldOffset(1, values, 0);
  b.finish(b.endObject());

  return b.asUint8Array().slice();
}

describe('FlatBuffers reflected values and schema bounds', () => {
  it.each([
    [-(2n ** 63n), 0n],
    [2n ** 63n - 1n, 2n ** 64n - 1n],
  ])('keeps signed %s and unsigned %s exactly, including declared defaults', (signed, unsigned) => {
    const schema = flatSchema([
      {
        name: 'Root',
        fields: [
          { name: 'signed', id: 0, type: { base: FB.long }, integer: signed },
          { name: 'unsigned', id: 1, type: { base: FB.ulong }, integer: unsigned },
        ],
      },
    ]);
    const b = new Builder(64);

    b.startObject(2);
    b.finish(b.endObject());
    expect(decode(schema, b.asUint8Array())).toEqual({ signed, unsigned: unsigned === 0n ? 0 : unsigned });
  });

  it('keeps vector union discriminators aligned with NONE, string and table payloads', () => {
    const bytes = unionVector();

    expect(decode(UNION_SCHEMA, bytes)).toEqual({
      choices_type: ['NONE', 'Text', 'Child'],
      choices: [null, 'text', { name: 'child' }],
    });

    const wire = new ByteBuffer(bytes);
    const root = wire.readInt32(0);
    const tags = wire.__vector(root + wire.__offset(root, 4));

    new DataView(bytes.buffer).setUint32(tags - 4, 2, true);
    expect(() => decode(UNION_SCHEMA, bytes)).toThrow();
  });

  it('keeps fixed arrays inside structs and vectors of strings', () => {
    const schema = flatSchema([
      {
        name: 'Root',
        fields: [
          { name: 'matrix', id: 0, type: { base: FB.obj, index: 1 } },
          { name: 'names', id: 1, type: { base: FB.vector, element: FB.string } },
        ],
      },
      {
        name: 'Matrix',
        struct: true,
        size: 16,
        align: 4,
        fields: [{ name: 'values', id: 0, offset: 0, type: { base: FB.array, element: FB.float, length: 4 } }],
      },
    ]);
    const b = new Builder(128);
    const names = ['left', 'right'].map((name) => b.createString(name));

    b.startVector(4, 2, 4);

    for (const name of names.toReversed()) b.addOffset(name);

    const list = b.endVector();

    b.startObject(2);
    b.addFieldOffset(1, list, 0);
    b.prep(4, 16);

    for (const v of [4, 3, 2, 1]) b.writeFloat32(v);

    b.addFieldStruct(0, b.offset(), 0);
    b.finish(b.endObject());
    expect(decode(schema, b.asUint8Array())).toEqual({
      matrix: { values: Float64Array.from([1, 2, 3, 4]) },
      names: ['left', 'right'],
    });
  });

  it('caches identical schema content and refuses too many fields before decoding their entries', () => {
    const schema = flatSchema([{ name: 'Root', fields: [] }]);

    expect(parseFlatSchema(schema.slice())).toBe(parseFlatSchema(schema));

    const bomb = flatSchema([
      {
        name: 'Root',
        fields: Array.from({ length: DECODE_LIMITS.fields + 1 }, (_, id) => ({
          name: `v${id}`,
          id,
          type: { base: FB.int },
        })),
      },
    ]);

    expect(() => parseFlatSchema(bomb)).toThrow(SCHEMA_REFUSED);
  });

  it('refuses cyclic inline structs and unsupported 64-bit offsets', () => {
    const cycle = flatSchema([
      {
        name: 'Root',
        struct: true,
        size: 4,
        align: 4,
        fields: [{ name: 'self', id: 0, offset: 0, type: { base: FB.obj, index: 0 } }],
      },
    ]);
    const vector64 = flatSchema([
      { name: 'Root', fields: [{ name: 'wide', id: 0, type: { base: 18, element: FB.int } }] },
    ]);

    const offset64 = flatSchema([
      { name: 'Root', fields: [{ name: 'wide', id: 0, offset64: true, type: { base: FB.string } }] },
    ]);

    expect(() => parseFlatSchema(offset64)).toThrow(SCHEMA_REFUSED);
    expect(() => parseFlatSchema(cycle)).toThrow(SCHEMA_REFUSED);
    expect(() => parseFlatSchema(vector64)).toThrow(SCHEMA_REFUSED);
  });
});
