import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { base64ToBytes } from './base64';
import { glbModel } from './modelMesh.fixtures';

function packGlb(document: Record<string, unknown>, binary: Uint8Array): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const binSize = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonSize + binSize);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonSize, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(json, 20);
  view.setUint32(20 + jsonSize, binSize, true);
  view.setUint32(24 + jsonSize, 0x004e4942, true);
  bytes.set(binary, 28 + jsonSize);

  return bytes;
}

export async function meshoptModel(): Promise<Uint8Array<ArrayBuffer>> {
  await MeshoptEncoder.ready;

  const plain = glbModel();
  const jsonLength = new DataView(plain.buffer).getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(plain.subarray(20, 20 + jsonLength)));
  const binary = plain.slice(28 + jsonLength);
  const encoded = MeshoptEncoder.encodeGltfBuffer(binary.subarray(0, 36), 3, 12, 'ATTRIBUTES');
  const compressed = new Uint8Array(binary.length + encoded.length);

  compressed.set(binary);
  compressed.set(encoded, binary.length);
  document.extensionsUsed = ['EXT_meshopt_compression'];
  document.extensionsRequired = ['EXT_meshopt_compression'];
  document.buffers[0].byteLength = compressed.length;
  document.bufferViews[0].extensions = {
    EXT_meshopt_compression: {
      buffer: 0,
      byteOffset: binary.length,
      byteLength: encoded.length,
      byteStride: 12,
      count: 3,
      mode: 'ATTRIBUTES',
      filter: 'NONE',
    },
  };

  return packGlb(document, compressed);
}

export function dracoModel(): Uint8Array<ArrayBuffer> {
  const binary = base64ToBytes(
    'RFJBQ08CAgEBAAAACAwBCwAAA19bCgEBEFUEXOONRgL/AAAAAQABAAkDAAECAQEJAwAAAwEBAQADAwEwARADACSWEwokBAAAAAD/BwAAAAAAvwAAAL8AAAC/AACAPwsGAwEBAQEBQAEA/wAAAH8AAAD/AqFBCAAA',
  );
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 1 } } },
          },
        ],
      },
    ],
    accessors: [
      { componentType: 5126, count: 24, type: 'VEC3', min: [-0.51, -0.51, -0.51], max: [0.51, 0.51, 0.51] },
      { componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 118 }],
    extensionsRequired: ['KHR_draco_mesh_compression'],
    extensionsUsed: ['KHR_draco_mesh_compression'],
  };

  return packGlb(document, binary);
}
