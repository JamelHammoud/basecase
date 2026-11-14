import { flatInteger } from './flatIntegers';
import { validateFlatSchema } from './flatValidate';
import type { FlatSchema, FlatType, FlatField, FlatObject, FlatEnum } from './flatTypes';
import { FlatWire } from './flatWire';
import { DECODE_LIMITS, refused } from './limits';

const integer = (r: SchemaReader, at: number, slot: number, fallback = 0) => {
  const field = r.field(at, slot);

  return field ? r.i32(field) : fallback;
};
const flag = (r: SchemaReader, at: number, slot: number) => {
  const field = r.field(at, slot, 1);

  return field ? r.bytes[field] !== 0 : false;
};
const short = (r: SchemaReader, at: number, slot: number) => {
  const field = r.field(at, slot, 2);

  return field ? r.u16(field) : 0;
};
const ref = (r: SchemaReader, at: number, slot: number) => {
  const field = r.field(at, slot);

  return field ? r.indirect(field) : 0;
};
const name = (r: SchemaReader, at: number) => {
  const field = r.field(at, 0);
  const value = field ? r.string(field) : '';

  if (!value || value.length > DECODE_LIMITS.schemaBytes) throw refused();

  return value;
};

function type(r: SchemaReader, at: number): FlatType {
  if (!at) throw refused();

  const byte = (slot: number) => {
    const field = r.field(at, slot, 1);

    return field ? r.bytes[field] : 0;
  };

  return { base: byte(0), element: byte(1), index: integer(r, at, 2, -1), length: short(r, at, 3) };
}

class SchemaReader extends FlatWire {
  readonly counts = { types: 0, fields: 0 };

  entries<T>(at: number, slot: number, kind: 'types' | 'fields', read: (at: number) => T): T[] {
    const field = this.field(at, slot);

    if (!field) throw refused();

    const vector = this.vector(field, 4);

    this.counts[kind] += vector.length;

    if (this.counts[kind] > DECODE_LIMITS[kind]) throw refused();

    return Array.from({ length: vector.length }, (_, i) => read(this.indirect(vector.start + 4 * i)));
  }
}

function readField(r: SchemaReader, at: number): FlatField {
  const whole = r.field(at, 4, 8);
  const real = r.field(at, 5, 8);

  if (flag(r, at, 13)) throw refused();

  return {
    name: name(r, at),
    type: type(r, ref(r, at, 1)),
    id: short(r, at, 2),
    offset: short(r, at, 3),
    integer: whole ? r.i64(whole) : 0n,
    real: real ? r.f64(real) : 0,
    optional: flag(r, at, 11),
    required: flag(r, at, 7),
  };
}

function readObject(r: SchemaReader, at: number): FlatObject {
  return {
    name: name(r, at),
    fields: r.entries(at, 1, 'fields', (p) => readField(r, p)),
    struct: flag(r, at, 2),
    align: integer(r, at, 3),
    size: integer(r, at, 4),
  };
}

function readEnum(r: SchemaReader, at: number): FlatEnum {
  const underlying = type(r, ref(r, at, 3));
  const values = r.entries(at, 1, 'fields', (p) => {
    const field = r.field(p, 1, 8);
    const t = ref(r, p, 3);

    const whole = field ? r.i64(field) : 0n;
    const value = flatInteger(underlying.base, whole);

    return [value, { name: name(r, p), type: t ? type(r, t) : null }] as const;
  });

  if (new Set(values.map((v) => v[0])).size !== values.length) throw refused();

  return { name: name(r, at), union: flag(r, at, 2), type: underlying, values: new Map(values) };
}

const cache: Array<{ bytes: Uint8Array; schema: FlatSchema }> = [];

export function parseFlatSchema(bytes: Uint8Array): FlatSchema {
  if (bytes.length > DECODE_LIMITS.schemaBytes) throw refused();

  const known = cache.find(
    (entry) => entry.bytes.length === bytes.length && entry.bytes.every((b, i) => b === bytes[i]),
  );

  if (known) return known.schema;

  try {
    const r = new SchemaReader(bytes);

    if (r.u32(4) !== 0x53424642) throw refused();

    const root = r.indirect(0);
    const schema = {
      objects: r.entries(root, 0, 'types', (at) => readObject(r, at)),
      enums: r.entries(root, 1, 'types', (at) => readEnum(r, at)),
    };

    const advanced = r.field(root, 6, 8);
    const declared = ref(r, root, 4);

    const features = advanced ? r.i64(advanced) : 0n;
    const declaredName = declared ? name(r, declared) : null;

    if (features < 0n || features > 7n) throw refused();

    if (declaredName && !schema.objects.some((o) => o.name === declaredName)) throw refused();

    validateFlatSchema(schema);

    if (cache.length >= 8) cache.shift();

    cache.push({ bytes: bytes.slice(), schema });

    return schema;
  } catch {
    throw refused();
  }
}
