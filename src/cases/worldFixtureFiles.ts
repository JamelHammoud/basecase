import type { FixtureMesh, FixtureSplat } from './worldFixtures';
import { boxOf } from './worldFrame';
import { concatenated } from './worldRead';
import { SPZ_HEADER_BYTES, SPZ_MAGIC } from './worldSpz';
import type { DroppedFile } from './worldTypes';

export type GltfJson = Record<string, unknown>;

export interface GltfOptions {
  node?: Record<string, unknown>;
  edit?: (json: GltfJson) => void;
}

const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const SH_C0 = 0.28209479177387814;
const SPZ_FRACTIONAL_BITS = 12;

const bytesOf = (array: Float32Array | Uint32Array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

function gltfParts(mesh: FixtureMesh, { node = {}, edit }: GltfOptions) {
  const positions = new Float32Array(mesh.positions);
  const colors = new Float32Array(mesh.colors);
  const indices = new Uint32Array(mesh.indices);
  const bin = concatenated([positions, colors, indices].map(bytesOf), (n) => new Uint8Array(n));
  const { min, max } = boxOf(positions);
  const vertices = positions.length / 3;
  const view = (byteOffset: number, byteLength: number) => ({ buffer: 0, byteOffset, byteLength });
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'Basecase fixtures' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      view(0, positions.byteLength),
      view(positions.byteLength, colors.byteLength),
      view(positions.byteLength + colors.byteLength, indices.byteLength),
    ],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count: vertices, type: 'VEC3', min, max },
      { bufferView: 1, componentType: FLOAT, count: vertices, type: 'VEC3' },
      { bufferView: 2, componentType: UNSIGNED_INT, count: indices.length, type: 'SCALAR' },
    ],
  };

  edit?.(json);

  return { json, bin };
}

function padded(bytes: Uint8Array, fill: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);

  out.set(bytes);

  return out;
}

export function glbFrom(json: GltfJson, bin: Uint8Array): Uint8Array {
  const text = padded(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const data = padded(bin, 0);
  const out = new Uint8Array(12 + 8 + text.byteLength + 8 + data.byteLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, text.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  view.setUint32(20 + text.byteLength, data.byteLength, true);
  view.setUint32(24 + text.byteLength, 0x004e4942, true);
  out.set(data, 28 + text.byteLength);

  return out;
}

export function glbOf(mesh: FixtureMesh, options: GltfOptions = {}): Uint8Array {
  const { json, bin } = gltfParts(mesh, options);

  return glbFrom(json, bin);
}

export function gltfOf(mesh: FixtureMesh, name = 'world', options: GltfOptions = {}): DroppedFile[] {
  const { json, bin } = gltfParts(mesh, {
    ...options,
    edit: (j) => {
      (j.buffers as GltfJson[])[0].uri = `${name}.bin`;
      options.edit?.(j);
    },
  });

  return [
    { name: `${name}.gltf`, bytes: new TextEncoder().encode(JSON.stringify(json)) },
    { name: `${name}.bin`, bytes: bin },
  ];
}

export function objOf(mesh: FixtureMesh): Uint8Array {
  const lines = ['# Basecase fixture'];

  for (let i = 0; i < mesh.positions.length; i += 3) lines.push(`v ${mesh.positions.slice(i, i + 3).join(' ')}`);

  for (let t = 0; t < mesh.indices.length; t += 3) {
    lines.push(
      `f ${mesh.indices
        .slice(t, t + 3)
        .map((i) => i + 1)
        .join(' ')}`,
    );
  }

  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}

const SPLAT_PLY_PROPERTIES = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2'];
const ROTATION_PROPERTIES = ['rot_0', 'rot_1', 'rot_2', 'rot_3'];

export function splatPlyOf(splat: FixtureSplat): Uint8Array {
  const properties = [...SPLAT_PLY_PROPERTIES, ...ROTATION_PROPERTIES];
  const points = splat.positions.length / 3;
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${points}`,
    ...properties.map((p) => `property float ${p}`),
    'end_header',
    '',
  ].join('\n');
  const values = new Float32Array(points * properties.length);
  const scale = Math.log(0.01);

  for (let i = 0; i < points; i++) {
    const color = splat.colors.slice(i * 3, i * 3 + 3).map((c) => (c - 0.5) / SH_C0);

    values.set([...splat.positions.slice(i * 3, i * 3 + 3), ...color, 3, scale, scale, scale, 1, 0, 0, 0], i * 14);
  }

  return concatenated([new TextEncoder().encode(header), bytesOf(values)], (n) => new Uint8Array(n));
}

export function spzRawOf(splat: FixtureSplat): Uint8Array {
  const points = splat.positions.length / 3;
  const out = new Uint8Array(SPZ_HEADER_BYTES + points * 19);
  const view = new DataView(out.buffer);
  const colors = SPZ_HEADER_BYTES + points * 10;

  view.setUint32(0, SPZ_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, points, true);
  view.setUint8(13, SPZ_FRACTIONAL_BITS);

  splat.positions.forEach((v, i) => {
    const fixed = Math.round(v * 2 ** SPZ_FRACTIONAL_BITS) & 0xffffff;

    out.set([fixed & 0xff, (fixed >> 8) & 0xff, (fixed >> 16) & 0xff], SPZ_HEADER_BYTES + i * 3);
  });
  out.fill(230, SPZ_HEADER_BYTES + points * 9, colors);
  splat.colors.forEach((c, i) => (out[colors + i] = Math.round(Math.min(1, Math.max(0, c)) * 255)));
  out.fill(128, colors + points * 3);

  return out;
}

export async function gzipped(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const spzOf = (splat: FixtureSplat) => gzipped(spzRawOf(splat));
