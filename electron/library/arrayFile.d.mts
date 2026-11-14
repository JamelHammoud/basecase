export type ArrayKind = 'f32' | 'f64' | 'i32';

export type Typed = Float32Array | Float64Array | Int32Array;

type Json = (this: unknown, key: string, value: unknown) => unknown;

export function packArrays(
  header: Record<string, unknown>,
  arrays: Array<[string, Typed]>,
  replacer?: Json,
): Uint8Array;

export function unpackArrays(
  bytes: Uint8Array,
  kinds: Record<string, ArrayKind>,
  reviver?: Json,
): { header: Record<string, unknown> & { arrays: Array<[string, number]> }; arrays: Record<string, Typed> } | null;
