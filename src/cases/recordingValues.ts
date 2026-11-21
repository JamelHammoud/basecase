const TYPED_TAG = '$typed';

const MADE: Partial<Record<string, (values: unknown[]) => unknown>> = {
  Float32Array: (v) => Float32Array.from(v as number[]),
  Float64Array: (v) => Float64Array.from(v as number[]),
  Int32Array: (v) => Int32Array.from(v as number[]),
  Uint8Array: (v) => Uint8Array.from(v as number[]),
  Map: (v) => new Map(v.filter((entry) => Array.isArray(entry) && entry.length === 2) as Array<[unknown, unknown]>),
  Set: (v) => new Set(v),
};

function valuesOf(value: unknown): unknown[] | null {
  if (value instanceof Map || value instanceof Set) return [...value];

  if (ArrayBuffer.isView(value) && !(value instanceof DataView))
    return Array.from(value as unknown as ArrayLike<number>);

  return null;
}

export function keepTyped(_key: string, value: unknown) {
  const values = valuesOf(value);

  return values ? { [TYPED_TAG]: (value as object).constructor.name, values } : value;
}

export function restoreTyped(_key: string, value: unknown) {
  if (typeof value !== 'object' || value === null || !(TYPED_TAG in value)) return value;

  const { [TYPED_TAG]: name, values } = value as { [TYPED_TAG]: string; values: unknown };
  const make = MADE[name];

  return make && Array.isArray(values) ? make(values) : null;
}
