import { refuse } from '../validate';
import { finite, integer, item, list, MAX_WORLD_VERTICES, record, resource } from './limits';

export interface GltfContext {
  document: Record<string, unknown>;
  buffers: Uint8Array[];
}

export function readGltfDocument(bytes: Uint8Array): { document: Record<string, unknown>; bin?: Uint8Array } {
  if (
    bytes.length < 4 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== 0x46546c67
  )
    return { document: record(JSON.parse(new TextDecoder().decode(bytes))) };

  return readGlbDocument(bytes);
}

function chunkSize(view: DataView, offset: number): number {
  if (offset + 8 > view.byteLength) return refuse('GLB', 'has a truncated chunk');

  const length = view.getUint32(offset, true);

  if (length % 4 || offset + 8 + length > view.byteLength) return refuse('GLB', 'has a truncated chunk');

  return length;
}

function readGlbDocument(bytes: Uint8Array): { document: Record<string, unknown>; bin?: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 20 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length)
    return refuse('GLB', 'has a broken header');

  let offset = 12;
  let document: Record<string, unknown> | undefined;
  let bin: Uint8Array | undefined;

  while (offset < bytes.length) {
    const length = chunkSize(view, offset);
    const type = view.getUint32(offset + 4, true);

    if (type === 0x4e4f534a && document) return refuse('GLB', 'has repeated JSON');

    if (type === 0x4e4f534a)
      document = record(JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length))));

    if (type === 0x004e4942 && bin) return refuse('GLB', 'has repeated buffers');

    if (type === 0x004e4942) bin = bytes.subarray(offset + 8, offset + 8 + length);

    offset += length + 8;
  }

  return { document: document ?? refuse('GLB', 'needs a JSON chunk'), bin };
}

export function gltfContext(bytes: Uint8Array, files: { name: string; files: Map<string, Uint8Array> }): GltfContext {
  const { document, bin } = readGltfDocument(bytes);

  if (record(document.asset).version !== '2.0') return refuse('glTF', 'needs version 2');

  if (list(document.extensionsRequired ?? []).length) return refuse('glTF', 'uses unsupported required extensions');

  const buffers = list(document.buffers, 256).map((value, i) => {
    const buffer = record(value);
    const data = buffer.uri === undefined && i === 0 ? bin : resource(buffer.uri, files);
    const length = integer(buffer.byteLength);

    return data && data.length >= length ? data.subarray(0, length) : refuse('glTF', 'has a truncated buffer');
  });

  return { document, buffers };
}

export function bufferView(index: unknown, context: GltfContext): Uint8Array {
  const v = item(context.document.bufferViews, index);
  const data = context.buffers[integer(v.buffer, context.buffers.length - 1)];
  const offset = integer(v.byteOffset ?? 0);
  const length = integer(v.byteLength);

  return offset + length <= data.length
    ? data.subarray(offset, offset + length)
    : refuse('glTF', 'has a truncated buffer view');
}

const COMPONENTS: Record<number, { size: number; read: (v: DataView, o: number) => number; divisor: number }> = {
  5121: { size: 1, read: (v, o) => v.getUint8(o), divisor: 255 },
  5123: { size: 2, read: (v, o) => v.getUint16(o, true), divisor: 65535 },
  5125: { size: 4, read: (v, o) => v.getUint32(o, true), divisor: 4294967295 },
  5126: { size: 4, read: (v, o) => v.getFloat32(o, true), divisor: 1 },
};

export function accessor(index: unknown, context: GltfContext, size: number): number[] {
  const a = item(context.document.accessors, index);
  const component = COMPONENTS[integer(a.componentType)];
  const count = integer(a.count, MAX_WORLD_VERTICES);

  if (
    !component ||
    a.sparse ||
    a.type !== ({ 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' } as Record<number, string>)[size]
  )
    return refuse('glTF', 'uses an unsupported accessor');

  const bytes = bufferView(a.bufferView, context);
  const v = item(context.document.bufferViews, a.bufferView);
  const stride = integer(v.byteStride ?? component.size * size, 252);
  const offset = integer(a.byteOffset ?? 0);

  if (stride < component.size * size || offset + Math.max(0, count - 1) * stride + size * component.size > bytes.length)
    return refuse('glTF', 'has a truncated accessor');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = Array.from({ length: count * size }, (_, i) =>
    finite(component.read(view, offset + Math.floor(i / size) * stride + (i % size) * component.size)),
  );

  return a.normalized ? values.map((v) => v / component.divisor) : values;
}
