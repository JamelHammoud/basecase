import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export const MESHOPT = 'EXT_meshopt_compression';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const NO_VERTEX = 0xffffffff;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);

const pad4 = (n) => (4 - (n % 4)) % 4;
const elementBytes = (accessor) => COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type];

export function readGlb(buf) {
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength;
  const bin = binStart + 8 <= buf.length ? buf.subarray(binStart + 8, binStart + 8 + buf.readUInt32LE(binStart)) : null;

  return { json, bin: bin ?? Buffer.alloc(0) };
}

export function packGlb(json, bin) {
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonBuf = Buffer.concat([rawJson, Buffer.alloc(pad4(rawJson.length), 0x20)]);
  const binBuf = Buffer.concat([bin, Buffer.alloc(pad4(bin.length))]);
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binHeader = Buffer.alloc(8);

  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(BIN_CHUNK, 4);

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]);
}

export function viewBytes(json, bin, index) {
  const view = json.bufferViews[index];
  const ext = view.extensions?.[MESHOPT];
  const start = view.byteOffset ?? 0;

  if (!ext) return bin.subarray(start, start + view.byteLength);

  const target = new Uint8Array(ext.count * ext.byteStride);
  const sourceStart = ext.byteOffset ?? 0;
  const source = bin.subarray(sourceStart, sourceStart + ext.byteLength);

  MeshoptDecoder.decodeGltfBuffer(target, ext.count, ext.byteStride, source, ext.mode, ext.filter);

  return target;
}

function viewUsers(json) {
  const users = json.bufferViews.map(() => []);

  json.accessors.forEach((accessor, i) => accessor.bufferView !== undefined && users[accessor.bufferView].push(i));

  return users;
}

function indexAccessors(json) {
  return new Set(json.meshes.flatMap((mesh) => mesh.primitives.map((p) => p.indices)).filter((i) => i !== undefined));
}

function tightlyOwned(json, users, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];

  return (
    users[accessor.bufferView].length === 1 &&
    !accessor.byteOffset &&
    (!view.byteStride || view.byteStride === elementBytes(accessor))
  );
}

function readIndices(accessor, bytes) {
  const copy = Uint8Array.from(bytes);
  const typed = accessor.componentType === 5123 ? new Uint16Array(copy.buffer) : new Uint32Array(copy.buffer);

  return Uint32Array.from(typed.subarray(0, accessor.count));
}

function remapAttribute(bytes, { remap, unique, size }) {
  const out = new Uint8Array(unique * size);

  for (let i = 0; i < remap.length; i++) {
    if (remap[i] !== NO_VERTEX) out.set(bytes.subarray(i * size, i * size + size), remap[i] * size);
  }

  return out;
}

function positionBounds(bytes, count) {
  const floats = new Float32Array(Uint8Array.from(bytes).buffer);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < count * 3; i++) {
    min[i % 3] = Math.min(min[i % 3], floats[i]);
    max[i % 3] = Math.max(max[i % 3], floats[i]);
  }

  return { min, max };
}

function reorderPrimitive(json, { views, users }, prim) {
  const attributes = Object.values(prim.attributes);

  if (prim.indices === undefined || ![prim.indices, ...attributes].every((a) => tightlyOwned(json, users, a))) return;

  const indexAccessor = json.accessors[prim.indices];
  const indices = readIndices(indexAccessor, views[indexAccessor.bufferView]);

  if (indices.length % 3 !== 0) return;

  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
  const narrow = indexAccessor.componentType === 5123;

  views[indexAccessor.bufferView] = new Uint8Array((narrow ? Uint16Array.from(indices) : indices).buffer);

  for (const a of attributes) {
    const accessor = json.accessors[a];
    const bytes = remapAttribute(views[accessor.bufferView], { remap, unique, size: elementBytes(accessor) });

    views[accessor.bufferView] = bytes;
    accessor.count = unique;

    if (a === prim.attributes.POSITION && accessor.min) Object.assign(accessor, positionBounds(bytes, unique));
  }
}

function encodePlan(json, { users, indexSet }, viewIndex) {
  const [only, ...rest] = users[viewIndex];

  if (only === undefined || rest.length || !tightlyOwned(json, users, only)) return null;

  const accessor = json.accessors[only];
  const stride = elementBytes(accessor);

  if (indexSet.has(only)) return accessor.count % 3 === 0 ? { mode: 'TRIANGLES', stride, count: accessor.count } : null;

  return stride % 4 === 0 ? { mode: 'ATTRIBUTES', stride, count: accessor.count } : null;
}

export function compressGlb(buf) {
  const { json, bin } = readGlb(buf);

  if (json.extensionsUsed?.includes(MESHOPT) || json.buffers?.length !== 1 || json.buffers[0].uri) return buf;

  const users = viewUsers(json);
  const views = json.bufferViews.map((_, i) => Uint8Array.from(viewBytes(json, bin, i)));
  const context = { views, users, indexSet: indexAccessors(json) };

  for (const mesh of json.meshes) for (const prim of mesh.primitives) reorderPrimitive(json, context, prim);

  const chunks = [];
  let offset = 0;
  let fallback = 0;

  json.bufferViews = json.bufferViews.map((view, i) => {
    const plan = encodePlan(json, context, i);
    const data = plan ? MeshoptEncoder.encodeGltfBuffer(views[i], plan.count, plan.stride, plan.mode) : views[i];
    const placed = { byteOffset: offset, byteLength: data.length };

    chunks.push(Buffer.from(data), Buffer.alloc(pad4(data.length)));
    offset += data.length + pad4(data.length);

    if (!plan) return { ...view, buffer: 0, ...placed };

    const raw = { buffer: 1, byteOffset: fallback, byteLength: plan.count * plan.stride };
    const stride = plan.mode === 'ATTRIBUTES' ? { byteStride: plan.stride } : {};
    const ext = { buffer: 0, ...placed, byteStride: plan.stride, count: plan.count, mode: plan.mode };

    fallback += raw.byteLength + pad4(raw.byteLength);

    return { ...view, ...raw, ...stride, extensions: { ...view.extensions, [MESHOPT]: ext } };
  });

  const packed = Buffer.concat(chunks);

  json.buffers = [
    { byteLength: packed.length },
    { byteLength: fallback, extensions: { [MESHOPT]: { fallback: true } } },
  ];
  json.extensionsUsed = [...(json.extensionsUsed ?? []), MESHOPT];
  json.extensionsRequired = [...(json.extensionsRequired ?? []), MESHOPT];

  return packGlb(json, packed);
}
