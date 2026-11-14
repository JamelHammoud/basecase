import type { WorldImportFile } from '../worldImportTypes';

export function objWorld(name = 'kitchen.obj', scale = 1, tilt = 0): WorldImportFile {
  const points = [
    [-3, 0, -2],
    [-3, 0, 2],
    [3, 0, 2],
    [3, 0, -2],
    [-1, 0.2, -1],
    [-1, 0.2, 0],
    [1, 0.2, 0],
    [1, 0.2, -1],
  ];
  const vertices = points.map(([x, y, z]) => {
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);

    return `v ${x * scale} ${(y * c - z * s) * scale} ${(y * s + z * c) * scale} 0.2 0.4 0.6`;
  });

  return { name, bytes: new TextEncoder().encode([...vertices, 'f 1 2 3 4', 'f 5 6 7 8'].join('\n')) };
}

export function gltfWorld(options: { uri?: string; nan?: boolean; count?: number; glb?: boolean } = {}) {
  const positions = new Float32Array([-3, 0, -2, -3, 0, 2, 3, 0, 2, 3, 0, -2]);

  if (options.nan) positions[0] = NaN;

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);

  bin.set(new Uint8Array(positions.buffer));
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);

  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length, ...(options.glb ? {} : { uri: options.uri ?? 'floor.bin' }) }],
    bufferViews: [
      { buffer: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: options.count ?? 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    materials: [{ name: 'Paint', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  return { document, bin };
}

export function gltfFiles(options: Parameters<typeof gltfWorld>[0] = {}): WorldImportFile[] {
  const { document, bin } = gltfWorld(options);

  return [
    { name: 'garage.gltf', bytes: new TextEncoder().encode(JSON.stringify(document)) },
    { name: 'floor.bin', bytes: bin },
  ];
}

export function glbFile(): WorldImportFile {
  const { document, bin } = gltfWorld({ glb: true });
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const binSize = Math.ceil(bin.length / 4) * 4;
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
  bytes.set(bin, 28 + jsonSize);

  return { name: 'garage.glb', bytes };
}

export function splatPly(value = '0', count = 1): WorldImportFile {
  const properties = ['x', 'y', 'z', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const text =
    [
      'ply',
      'format ascii 1.0',
      `element vertex ${count}`,
      ...properties.map((name) => `property float ${name}`),
      'end_header',
      `${value} 0 0 1 0 0 0 1 0 0 0`,
    ].join('\n') + '\n';

  return { name: 'capture.ply', bytes: new TextEncoder().encode(text) };
}

export async function splatSpz(count = 1): Promise<WorldImportFile> {
  const bytes = new Uint8Array(16 + 20);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x5053474e, true);
  view.setUint32(4, 3, true);
  view.setUint32(8, count, true);
  bytes[13] = 12;

  const compressed = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();

  return { name: 'capture.spz', bytes: new Uint8Array(compressed) };
}

function rawZstd(length: number): Uint8Array {
  const bytes = new Uint8Array(9 + length);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0xfd2fb528, true);
  bytes[4] = 32;
  bytes[5] = length;
  bytes[6] = (length << 3) | 1;

  return bytes;
}

export function splatSpz4(): WorldImportFile {
  const streams = [9, 1, 3, 3, 4].map(rawZstd);
  const bytes = new Uint8Array(32 + 5 * 16 + streams.reduce((sum, stream) => sum + stream.length, 0));
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x5053474e, true);
  view.setUint32(4, 4, true);
  view.setUint32(8, 1, true);
  bytes[13] = 12;
  bytes[15] = 5;
  view.setUint32(16, 32, true);

  let offset = 112;

  for (let i = 0; i < streams.length; i++) {
    view.setBigUint64(32 + i * 16, BigInt(streams[i].length), true);
    view.setBigUint64(40 + i * 16, BigInt(streams[i].length - 9), true);
    bytes.set(streams[i], offset);
    offset += streams[i].length;
  }

  return { name: 'capture.spz', bytes };
}
