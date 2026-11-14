import { fitsFlatInteger } from './flatIntegers';
import { flatWidth, type FlatEnum, type FlatField, type FlatObject, type FlatSchema, type FlatType } from './flatTypes';
import { DECODE_LIMITS, refused } from './limits';

const isContainer = (t: FlatType) => t.base === 14 || t.base === 17;
const isStruct = (schema: FlatSchema, t: FlatType) => t.base === 15 && schema.objects[t.index]?.struct;
const inlineType = (schema: FlatSchema, t: FlatType) => t.base < 13 || isStruct(schema, t);

function validateIndex(schema: FlatSchema, t: FlatType) {
  if (t.index < -1) throw refused();

  if (t.base === 15 && !schema.objects[t.index]) throw refused();

  if (t.base === 15) return;

  if (t.index === -1 && t.base !== 16 && t.base !== 1) return;

  const e = schema.enums[t.index];

  if (!e || (t.base === 16 && !e.union)) throw refused();

  if (t.base !== 16 && e.type.base !== t.base) throw refused();
}

function validateType(schema: FlatSchema, t: FlatType) {
  const value = isContainer(t) ? { ...t, base: t.element, element: 0 } : t;

  if (t.base < 1 || t.base > 17 || value.base < 1 || value.base > 16 || value.base === 14) throw refused();

  validateIndex(schema, value);

  if (t.base === 17 && (!t.length || !inlineType(schema, value))) throw refused();
}

function validateUnion(o: FlatObject, f: FlatField) {
  const union = f.type.base === 16 || (f.type.base === 14 && f.type.element === 16);

  if (!union) return;

  const tag = o.fields.find((d) => d.id === f.id - 1)?.type;
  const base = f.type.base === 16 ? 1 : 14;

  if (!tag || tag.base !== base || tag.index !== f.type.index) throw refused();

  if (base === 14 && tag.element !== 1) throw refused();
}

function validateField(schema: FlatSchema, o: FlatObject, f: FlatField) {
  validateType(schema, f.type);
  validateUnion(o, f);

  if (!fitsFlatInteger(f.type.base, f.integer)) throw refused();

  if (!o.struct && (f.offset !== 4 + f.id * 2 || f.type.base === 17)) throw refused();

  if (!o.struct) return;

  const value = f.type.base === 17 ? { ...f.type, base: f.type.element } : f.type;

  if (f.offset + flatWidth(schema, f.type) > o.size || !inlineType(schema, value)) throw refused();
}

function validateObject(schema: FlatSchema, o: FlatObject) {
  const names = new Set(o.fields.map((f) => f.name));
  const ids = new Set(o.fields.map((f) => f.id));

  if (names.size !== o.fields.length || ids.size !== o.fields.length) throw refused();

  const validSize = o.size > 0 && o.size <= DECODE_LIMITS.schemaBytes && o.size % o.align === 0;

  if (o.struct && (!validSize || ![1, 2, 4, 8, 16].includes(o.align))) throw refused();

  for (const f of o.fields) validateField(schema, o, f);
}

interface StructWalk {
  active: Set<FlatObject>;
  heights: Map<FlatObject, number>;
}

function structHeight(schema: FlatSchema, o: FlatObject, walk: StructWalk): number {
  const known = walk.heights.get(o);

  if (known !== undefined) return known;

  if (walk.active.has(o) || walk.active.size >= DECODE_LIMITS.depth) throw refused();

  walk.active.add(o);

  let height = 1;

  for (const f of o.fields) {
    const base = f.type.base === 17 ? f.type.element : f.type.base;
    const next = base === 15 ? schema.objects[f.type.index] : null;

    if (next?.struct) height = Math.max(height, 1 + structHeight(schema, next, walk));
  }

  if (height > DECODE_LIMITS.depth) throw refused();

  walk.active.delete(o);
  walk.heights.set(o, height);

  return height;
}

const enumBase = (base: number) => base >= 1 && base <= 10 && base !== 2;

function validateEnum(schema: FlatSchema, e: FlatEnum) {
  if (!enumBase(e.type.base) || (e.union && e.type.base !== 1)) throw refused();

  if (e.union && !e.values.has(0n)) throw refused();

  for (const [value, v] of e.values) {
    if (!fitsFlatInteger(e.type.base, value)) throw refused();

    const validUnion = value === 0n || (v.type && [13, 15].includes(v.type.base));

    if (e.union && !validUnion) throw refused();

    if (v.type && v.type.base !== 0) validateType(schema, v.type);
  }
}

export function validateFlatSchema(schema: FlatSchema) {
  const all = [...schema.objects, ...schema.enums];
  const fields =
    schema.objects.reduce((n, o) => n + o.fields.length, 0) + schema.enums.reduce((n, e) => n + e.values.size, 0);

  if (
    all.length > DECODE_LIMITS.types ||
    fields > DECODE_LIMITS.fields ||
    new Set(all.map((o) => o.name)).size !== all.length
  )
    throw refused();

  for (const e of schema.enums) validateEnum(schema, e);

  for (const o of schema.objects) validateObject(schema, o);

  const walk: StructWalk = { active: new Set(), heights: new Map() };

  for (const o of schema.objects.filter((o) => o.struct)) structHeight(schema, o, walk);
}
