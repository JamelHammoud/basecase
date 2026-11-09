import type { MainModule, MjModel } from '@mujoco/mujoco';

export const FIELD = { f64: 0, i32: 1, f32: 2, u8: 3, size: 4, option: 5, state: 6, integration: 7, absent: 8 };

export interface FieldValue {
  kind: number;
  name: string;
  bytes: Uint8Array;
}

const asBytes = (view: ArrayBufferView) =>
  new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));

const numbers = (values: number[]) => asBytes(Float64Array.from(values));

const absent = (key: string): FieldValue => ({ kind: FIELD.absent, name: key, bytes: new Uint8Array() });

function typedKind(value: unknown) {
  if (value instanceof Float64Array) return FIELD.f64;

  if (value instanceof Int32Array) return FIELD.i32;

  if (value instanceof Float32Array) return FIELD.f32;

  if (value instanceof Uint8Array || value instanceof Int8Array) return FIELD.u8;

  return null;
}

function arrayField(model: MjModel, key: string, name: string): FieldValue {
  const value = (model as unknown as Record<string, unknown>)[name];
  const kind = typedKind(value);

  return kind === null ? absent(key) : { kind, name, bytes: asBytes(value as ArrayBufferView) };
}

function sizeField(model: MjModel, key: string, name: string): FieldValue {
  const value = (model as unknown as Record<string, unknown>)[name];

  return typeof value === 'number' ? { kind: FIELD.size, name, bytes: numbers([value]) } : absent(key);
}

function optionField(model: MjModel, key: string, name: string): FieldValue {
  const value = (model.opt as unknown as Record<string, unknown>)[name];

  if (typeof value === 'number') return { kind: FIELD.option, name, bytes: numbers([value]) };

  if (ArrayBuffer.isView(value)) return { kind: FIELD.option, name, bytes: numbers(Array.from(value as Float64Array)) };

  return absent(key);
}

export function answer(mj: MainModule, model: MjModel, key: string): FieldValue {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const name = key.slice(at + 1);

  if (kind === 'array') return arrayField(model, key, name);

  if (kind === 'size') return sizeField(model, key, name);

  if (kind === 'option') return optionField(model, key, name);

  if (kind === 'state') return { kind: FIELD.state, name, bytes: numbers([mj.mj_stateSize(model, Number(name))]) };

  return absent(key);
}

export const integrationField = (mj: MainModule): FieldValue => ({
  kind: FIELD.integration,
  name: 'integration',
  bytes: numbers([mj.mjtState.mjSTATE_INTEGRATION.value]),
});
