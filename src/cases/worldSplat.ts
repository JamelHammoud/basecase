import type { DroppedFile } from './worldTypes';
import { damaged, MAX_SPLAT_POINTS, withCommas, worldRefuse } from './worldRead';

interface PlyProperty {
  name: string;
  type: string;
  list: boolean;
}

interface PlyElement {
  name: string;
  count: number;
  properties: PlyProperty[];
}

export interface PlyHeader {
  format: string;
  length: number;
  elements: PlyElement[];
}

const MAX_HEADER_BYTES = 64 * 1024;
const END_HEADER = /end_header\r?\n/;
const SPLAT_PROPERTIES = ['f_dc_0', 'opacity', 'scale_0', 'rot_0'];
const PLY_BYTES: Record<string, number> = {
  char: 1,
  uchar: 1,
  int8: 1,
  uint8: 1,
  short: 2,
  ushort: 2,
  int16: 2,
  uint16: 2,
  int: 4,
  uint: 4,
  int32: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
};
const FLOATS = ['float', 'float32'];

function headerLine(header: PlyHeader, words: string[]) {
  const [kind, ...rest] = words;
  const element = header.elements.at(-1);

  if (kind === 'format') header.format = rest[0];

  if (kind === 'element') header.elements.push({ name: rest[0], count: Number(rest[1]), properties: [] });

  if (kind === 'property' && element) {
    const list = rest[0] === 'list';

    element.properties.push({ name: rest.at(-1) ?? '', type: list ? 'list' : rest[0], list });
  }
}

export function plyHeader(bytes: Uint8Array): PlyHeader | null {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, MAX_HEADER_BYTES));
  const end = END_HEADER.exec(text);

  if (!/^ply\r?\n/.test(text) || !end) return null;

  const header: PlyHeader = { format: '', length: end.index + end[0].length, elements: [] };

  for (const line of text.slice(0, end.index).split(/\r?\n/)) headerLine(header, line.trim().split(/\s+/));

  return header;
}

const vertexElement = (header: PlyHeader) => header.elements.find((e) => e.name === 'vertex');

export function isSplatHeader(header: PlyHeader | null): header is PlyHeader {
  const vertex = header && vertexElement(header);

  if (!vertex || header.elements.some((e) => e.name === 'face')) return false;

  const names = vertex.properties.map((p) => p.name);

  return SPLAT_PROPERTIES.every((p) => names.includes(p)) && !vertex.properties.some((p) => p.list);
}

export const isSplatPly = (bytes: Uint8Array) => isSplatHeader(plyHeader(bytes));

function splatLayout(header: PlyHeader, name: string) {
  const [vertex] = header.elements;

  if (header.format !== 'binary_little_endian') worldRefuse(`Export ${name} as a binary little-endian PLY.`);

  if (header.elements.length !== 1 || !Number.isSafeInteger(vertex.count) || vertex.count < 0) damaged(name);

  if (vertex.count > MAX_SPLAT_POINTS) worldRefuse(`${name} has over ${withCommas(MAX_SPLAT_POINTS)} points.`);

  const offsets: Record<string, number> = {};
  let stride = 0;

  for (const p of vertex.properties) {
    offsets[p.name] = FLOATS.includes(p.type) ? stride : -1;
    stride += PLY_BYTES[p.type] ?? damaged(name);
  }

  const xyz = ['x', 'y', 'z'].map((axis) => offsets[axis] ?? -1);

  return xyz.some((o) => o < 0) ? damaged(name) : { points: vertex.count, stride, xyz };
}

export function readSplatPly(file: DroppedFile): number {
  const header = plyHeader(file.bytes);

  if (!isSplatHeader(header)) return damaged(file.name);

  const { points, stride, xyz } = splatLayout(header, file.name);
  const { bytes } = file;

  if (bytes.byteLength !== header.length + points * stride) damaged(file.name);

  const view = new DataView(bytes.buffer, bytes.byteOffset + header.length, points * stride);

  for (let i = 0; i < points; i++) {
    if (!xyz.every((o) => Number.isFinite(view.getFloat32(i * stride + o, true)))) {
      worldRefuse(`${file.name} has a point that isn’t a number.`);
    }
  }

  return points;
}
