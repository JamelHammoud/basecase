import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { writePng } from '../bench/geometry.mjs';

export const hash = (data) =>
  crypto
    .createHash('sha256')
    .update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    .digest('hex')
    .slice(0, 16);

const QUADS = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
];

export function box([sx, sy, sz], [ox, oy, oz] = [0, 0, 0]) {
  const corners = [];

  for (let i = 0; i < 8; i++) corners.push([ox + (i & 4 ? sx : 0), oy + (i & 2 ? sy : 0), oz + (i & 1 ? sz : 0)]);

  const out = [];

  for (const [a, b, c, d] of QUADS)
    out.push(...corners[a], ...corners[b], ...corners[c], ...corners[a], ...corners[c], ...corners[d]);

  return new Float32Array(out);
}

export const robot = () => {
  const legs = [box([20, 30, 80], [-30, -15, 0]), box([20, 30, 80], [10, -15, 0])];
  const body = box([80, 40, 60], [-40, -20, 80]);
  const head = box([30, 50, 30], [-15, -10, 140]);

  return Float32Array.from([...legs[0], ...legs[1], ...body, ...head]);
};

export function summarize(score) {
  const { views, ...rest } = score;

  return {
    ...rest,
    views: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, `${v.w}x${v.h} ${hash(v.r)} ${hash(v.g)}`])),
  };
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);

  len.writeUInt32BE(data.length);

  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}

export function rawPng({ w, h, type, rows }) {
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = type;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function filteredRows(w, h, ch) {
  const stride = w * ch;
  const rows = Buffer.alloc((stride + 1) * h);

  for (let y = 0; y < h; y++) {
    rows[y * (stride + 1)] = y % 5;

    for (let x = 0; x < stride; x++) rows[y * (stride + 1) + 1 + x] = (x * 37 + y * 91 + 13) & 255;
  }

  return rows;
}

export function drawingPng(file) {
  const w = 60,
    h = 100;
  const rgb = Buffer.alloc(w * h * 3, 255);

  for (let y = 10; y < 90; y++) {
    const half = y > 50 ? 20 : 10;

    for (let x = 30 - half; x < 30 + half; x++) rgb.set([20, 20, 20], (y * w + x) * 3);
  }

  writePng(file, w, h, rgb);
}

export function writeTestGlb(file) {
  const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const strided = new Float32Array([0, 0, 0, 99, 5, 0, 0, 99, 0, 5, 0, 99]);
  const bin = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(indices.buffer),
    Buffer.alloc(4),
    Buffer.from(strided.buffer),
  ]);
  const json = {
    scene: 0,
    scenes: [{ nodes: [0, 2] }],
    nodes: [
      { mesh: 0, translation: [1, 2, 3], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], children: [1] },
      { mesh: 1, scale: [2, 2, 2] },
      { mesh: 1, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1] },
    ],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, indices: 1 },
          { attributes: { POSITION: 0 }, mode: 1 },
        ],
      },
      { primitives: [{ attributes: { POSITION: 2 } }] },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 12 },
      { buffer: 0, byteOffset: 64, byteLength: 48, byteStride: 16 },
    ],
  };
  let text = Buffer.from(JSON.stringify(json));

  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)]);

  const chunk = (data, type) => {
    const head = Buffer.alloc(8);

    head.writeUInt32LE(data.length, 0);
    head.write(type, 4, 'ascii');

    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(text, 'JSON'), chunk(bin, 'BIN\0')]);
  const header = Buffer.alloc(12);

  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  fs.writeFileSync(file, Buffer.concat([header, body]));
}
