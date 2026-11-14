import { damaged, listOf, recordOf, wholeOf, wholeOr, worldRefuse } from './worldRead';

export interface AccessorSource {
  name: string;
  json: Record<string, unknown>;
  buffers: Uint8Array[];
}

interface AccessorData {
  view: DataView;
  base: number;
  stride: number;
  count: number;
  componentType: number;
}

const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const COMPONENT_BYTES: Record<number, number> = {
  [UNSIGNED_BYTE]: 1,
  [UNSIGNED_SHORT]: 2,
  [UNSIGNED_INT]: 4,
  [FLOAT]: 4,
};
const MAX_STRIDE = 252;

const unreadable = (name: string): never => worldRefuse(`${name} stores its mesh in a form Basecase can’t read.`);

export function accessorOf(json: Record<string, unknown>, index: unknown, name: string): Record<string, unknown> {
  const accessors = listOf(json.accessors, name);
  const at = wholeOf(index, name);

  return at < accessors.length ? recordOf(accessors[at], name) : damaged(name);
}

interface Wanted {
  index: unknown;
  type: 'SCALAR' | 'VEC3';
  components: number[];
}

function bufferViewOf(source: AccessorSource, index: unknown) {
  const { json, buffers, name } = source;
  const views = listOf(json.bufferViews, name);
  const at = wholeOf(index, name);
  const view = at < views.length ? recordOf(views[at], name) : damaged(name);
  const buffer = buffers[wholeOf(view.buffer, name)] ?? damaged(name);
  const offset = wholeOr(view.byteOffset, 0, name);
  const length = wholeOf(view.byteLength, name);

  if (offset + length > buffer.byteLength) damaged(name);

  return { view: new DataView(buffer.buffer, buffer.byteOffset + offset, length), stride: view.byteStride };
}

function accessorData(source: AccessorSource, wanted: Wanted): AccessorData {
  const { name } = source;
  const accessor = accessorOf(source.json, wanted.index, name);
  const componentType = accessor.componentType as number;

  if (accessor.sparse !== undefined || accessor.bufferView === undefined) unreadable(name);

  if (accessor.type !== wanted.type || !wanted.components.includes(componentType)) unreadable(name);

  const count = wholeOf(accessor.count, name);
  const { view, stride: declared } = bufferViewOf(source, accessor.bufferView);
  const size = COMPONENT_BYTES[componentType] * (wanted.type === 'VEC3' ? 3 : 1);
  const stride = wholeOr(declared, size, name);
  const base = wholeOr(accessor.byteOffset, 0, name);

  if (stride < size || stride > MAX_STRIDE) damaged(name);

  if (count > 0 && base + (count - 1) * stride + size > view.byteLength) damaged(name);

  return { view, base, stride, count, componentType };
}

export const accessorCount = (source: AccessorSource, index: unknown) =>
  wholeOf(accessorOf(source.json, index, source.name).count, source.name);

export function readPositions(source: AccessorSource, index: unknown): Float32Array {
  const { view, base, stride, count } = accessorData(source, { index, type: 'VEC3', components: [FLOAT] });
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const at = base + i * stride;

    out[i * 3] = view.getFloat32(at, true);
    out[i * 3 + 1] = view.getFloat32(at + 4, true);
    out[i * 3 + 2] = view.getFloat32(at + 8, true);
  }

  return out;
}

const INDEX_READERS: Record<number, (view: DataView, at: number) => number> = {
  [UNSIGNED_BYTE]: (view, at) => view.getUint8(at),
  [UNSIGNED_SHORT]: (view, at) => view.getUint16(at, true),
  [UNSIGNED_INT]: (view, at) => view.getUint32(at, true),
};

export function readIndices(source: AccessorSource, index: unknown, vertices: number): Uint32Array {
  const components = [UNSIGNED_BYTE, UNSIGNED_SHORT, UNSIGNED_INT];
  const { view, base, stride, count, componentType } = accessorData(source, { index, type: 'SCALAR', components });
  const read = INDEX_READERS[componentType];
  const out = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const value = read(view, base + i * stride);

    if (value >= vertices) damaged(source.name);

    out[i] = value;
  }

  return out;
}

export function accessorBounds(json: Record<string, unknown>, index: unknown, name: string) {
  const accessor = accessorOf(json, index, name);
  const { min, max } = accessor;
  const valid = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

  return valid(min) && valid(max) ? { min: min as number[], max: max as number[] } : undefined;
}
