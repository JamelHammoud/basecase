import { flatWidth, type FlatField, type FlatObject, type FlatSchema, type FlatType } from './flatTypes';
import { parseFlatSchema } from './flatSchema';
import { exactInteger, FlatWire } from './flatWire';
import { damaged, DECODE_LIMITS, refused } from './limits';
import type { Decoded, DecodedMessage, MessageDecoder } from './types';

interface State {
  schema: FlatSchema;
  wire: FlatWire;
}

interface Context {
  object: FlatObject;
  field: FlatField;
  location: (field: FlatField) => number;
  depth: number;
}

const element = (t: FlatType): FlatType => ({ ...t, base: t.element, element: 0 });

function enumValue(schema: FlatSchema, type: FlatType, value: number | bigint | boolean): Decoded {
  if (type.index < 0) return value;

  return schema.enums[type.index].values.get(BigInt(value))?.name ?? value;
}

function defaultOf(schema: FlatSchema, field: FlatField): Decoded {
  const { base } = field.type;

  if (field.optional || base >= 13) return null;

  if (base === 2) return field.integer !== 0n;

  if (base === 11 || base === 12) return field.real;

  const whole = base === 10 ? BigInt.asUintN(64, field.integer) : field.integer;

  return enumValue(schema, field.type, exactInteger(whole));
}

function tagLocation(ctx: Context): number {
  const field = ctx.object.fields.find((f) => f.id === ctx.field.id - 1);

  return field ? ctx.location(field) : 0;
}

function discriminator(state: State, ctx: Context): bigint {
  const at = tagLocation(ctx);

  return at ? BigInt(state.wire.scalar(1, at)) : 0n;
}

function unionTags(state: State, ctx: Context, length: number): number | null {
  if (ctx.field.type.element !== 16) return null;

  const at = tagLocation(ctx);

  if (!at) throw damaged();

  const vector = state.wire.vector(at, 1);

  if (vector.length !== length) throw damaged();

  return vector.start;
}

function union(state: State, type: FlatType, at: number, context: { tag: bigint; depth: number }): Decoded {
  const { tag, depth } = context;

  if (tag === 0n && at && state.wire.u32(at) !== 0) throw damaged();

  if (tag === 0n) return null;

  const alternative = state.schema.enums[type.index]?.values.get(tag)?.type;

  if (!alternative || !at) throw damaged();

  if (alternative.base === 13) return state.wire.string(at);

  return object(state, state.schema.objects[alternative.index], state.wire.indirect(at), depth + 1);
}

function value(state: State, type: FlatType, at: number, depth: number): Decoded {
  if (depth > DECODE_LIMITS.depth) throw refused();

  if (type.base === 13) return state.wire.string(at);

  if (type.base === 15) {
    const spec = state.schema.objects[type.index];

    return object(state, spec, spec.struct ? at : state.wire.indirect(at), depth + 1);
  }

  return enumValue(state.schema, type, state.wire.scalar(type.base, at));
}

function vector(state: State, ctx: Context, at: number): Decoded {
  const type = ctx.field.type;
  const item = element(type);
  const width = flatWidth(state.schema, item);
  const span = type.base === 17 ? { start: at, length: type.length } : state.wire.vector(at, width);

  if (type.base === 17) {
    state.wire.range(at, width * span.length);
    state.wire.budget.spend(span.length);
  }

  if (item.base === 4 && item.index === -1) return state.wire.bytes.slice(span.start, span.start + span.length);

  const tags = unionTags(state, ctx, span.length);
  const items: Decoded[] = [];

  for (let i = 0; i < span.length; i++) {
    const position = span.start + i * width;
    const decoded =
      item.base === 16
        ? union(state, item, position, { tag: BigInt(state.wire.scalar(1, tags! + i)), depth: ctx.depth })
        : value(state, item, position, ctx.depth);

    items.push(decoded);
  }

  return items.length > 0 && items.every((v) => typeof v === 'number') ? Float64Array.from(items as number[]) : items;
}

function readUnion(state: State, ctx: Context, at: number) {
  const tag = discriminator(state, ctx);

  if (ctx.field.required && tag === 0n) throw damaged();

  return union(state, ctx.field.type, at, { tag, depth: ctx.depth });
}

function readField(state: State, ctx: Context): Decoded {
  const at = ctx.location(ctx.field);
  const { type } = ctx.field;

  if (!at && ctx.field.required) throw damaged();

  if (type.base === 16) return readUnion(state, ctx, at);

  if (type.base === 14 && type.element === 16 && Boolean(at) !== Boolean(tagLocation(ctx))) throw damaged();

  if (!at) return defaultOf(state.schema, ctx.field);

  if (type.base === 14 || type.base === 17) return vector(state, ctx, at);

  return value(state, type, at, ctx.depth);
}

function object(state: State, spec: FlatObject, at: number, depth: number): DecodedMessage {
  if (depth > DECODE_LIMITS.depth) throw refused();

  state.wire.budget.spend(spec.fields.length + 1);

  const table = spec.struct ? null : state.wire.table(at);
  const location = (f: FlatField) => (table ? table(f.offset, flatWidth(state.schema, f.type)) : at + f.offset);

  if (spec.struct) state.wire.range(at, spec.size);

  return Object.fromEntries(
    spec.fields.map((field) => [field.name, readField(state, { object: spec, field, location, depth })]),
  );
}

export function flatDecoder(name: string, bytes: Uint8Array): MessageDecoder {
  const schema = parseFlatSchema(bytes);
  const root = schema.objects.find((o) => o.name === name);

  if (!root || root.struct) throw refused();

  return (bytes) => {
    try {
      const wire = new FlatWire(bytes);

      return object({ schema, wire }, root, wire.indirect(0), 0);
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) throw damaged();

      throw error;
    }
  };
}
