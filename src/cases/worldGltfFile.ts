import type { DroppedFile } from './worldTypes';
import { damaged, fileExtension, isRecord, listOf, recordOf, wholeOf, worldRefuse } from './worldRead';

export interface GltfDoc {
  name: string;
  json: Record<string, unknown>;
  bin?: Uint8Array;
}

const GLB_MAGIC = 0x46546c67;
const GLB_HEADER = 12;
const CHUNK_HEADER = 8;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPRESSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];
const DATA_URI = /^data:[\w/+.-]*;base64,/;

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function parsedJson(bytes: Uint8Array, name: string): Record<string, unknown> {
  try {
    return recordOf(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), name);
  } catch {
    return damaged(name);
  }
}

function glbChunks(bytes: Uint8Array, name: string) {
  const view = viewOf(bytes);

  if (bytes.byteLength < GLB_HEADER + CHUNK_HEADER || view.getUint32(0, true) !== GLB_MAGIC) damaged(name);

  if (view.getUint32(4, true) !== 2) worldRefuse(`${name} isn’t glTF 2.`);

  const total = view.getUint32(8, true);
  const chunks: Array<{ type: number; bytes: Uint8Array }> = [];

  if (total > bytes.byteLength) damaged(name);

  for (let at = GLB_HEADER; at + CHUNK_HEADER <= total;) {
    const length = view.getUint32(at, true);
    const start = at + CHUNK_HEADER;

    if (start + length > total) damaged(name);

    chunks.push({ type: view.getUint32(at + 4, true), bytes: bytes.subarray(start, start + length) });
    at = start + length;
  }

  return chunks;
}

function readGlb(file: DroppedFile): GltfDoc {
  const chunks = glbChunks(file.bytes, file.name);

  if (chunks[0]?.type !== JSON_CHUNK) damaged(file.name);

  return {
    name: file.name,
    json: parsedJson(chunks[0].bytes, file.name),
    bin: chunks.find((c) => c.type === BIN_CHUNK)?.bytes,
  };
}

const extensionsOf = (value: unknown) =>
  Object.keys(isRecord(value) && isRecord(value.extensions) ? value.extensions : {});

const compressed = (names: unknown[]) => names.some((n) => COMPRESSIONS.includes(n as string));

function primitivesOf(json: Record<string, unknown>, name: string): unknown[] {
  return listOf(json.meshes, name).flatMap((mesh) => listOf(recordOf(mesh, name).primitives, name));
}

function refuseCompressed(doc: GltfDoc) {
  const { json, name } = doc;
  const views = listOf(json.bufferViews, name);
  const parts = [...primitivesOf(json, name), ...views];

  if (compressed(listOf(json.extensionsRequired, name)) || parts.some((p) => compressed(extensionsOf(p)))) {
    worldRefuse(`${name} is compressed. Export it without Draco or meshopt.`);
  }
}

export function readGltfDoc(file: DroppedFile): GltfDoc {
  const doc =
    fileExtension(file.name) === 'glb' ? readGlb(file) : { name: file.name, json: parsedJson(file.bytes, file.name) };

  refuseCompressed(doc);

  return doc;
}

export function localName(uri: string): string | undefined {
  let name: string;

  try {
    name = decodeURIComponent(uri);
  } catch {
    return undefined;
  }

  const unsafe = !name || /[/\\:\0]/.test(name) || name.includes('..');

  return unsafe ? undefined : name;
}

function base64Bytes(uri: string, name: string): Uint8Array {
  try {
    return Uint8Array.from(atob(uri.replace(DATA_URI, '')), (c) => c.charCodeAt(0));
  } catch {
    return damaged(name);
  }
}

function uriBytes(uri: unknown, doc: GltfDoc, files: DroppedFile[]): Uint8Array {
  if (typeof uri !== 'string') return damaged(doc.name);

  if (DATA_URI.test(uri)) return base64Bytes(uri, doc.name);

  const local = localName(uri);

  if (local === undefined) return worldRefuse(`${doc.name} reads a file outside the drop.`);

  const file = files.find((f) => f.name === local);

  return file ? file.bytes : worldRefuse(`Drop ${local} with ${doc.name}.`);
}

export function gltfBuffers(doc: GltfDoc, files: DroppedFile[]): Uint8Array[] {
  return listOf(doc.json.buffers, doc.name).map((value) => {
    const buffer = recordOf(value, doc.name);
    const length = wholeOf(buffer.byteLength, doc.name);
    const bytes = buffer.uri === undefined ? doc.bin : uriBytes(buffer.uri, doc, files);

    return bytes && bytes.byteLength >= length ? bytes.subarray(0, length) : damaged(doc.name);
  });
}

const droppedUri = (value: unknown, files: DroppedFile[]) => {
  const uri = isRecord(value) && typeof value.uri === 'string' ? value.uri : '';
  const local = DATA_URI.test(uri) ? undefined : localName(uri);

  return files.find((f) => f.name === local)?.name;
};

export function gltfFileNames(doc: GltfDoc, files: DroppedFile[]): string[] {
  const refs = [...listOf(doc.json.buffers, doc.name), ...listOf(doc.json.images, doc.name)];

  return [...new Set(refs.flatMap((r) => droppedUri(r, files) ?? []))];
}
