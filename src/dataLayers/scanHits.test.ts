import { describe, expect, it } from 'vitest';
import { fromMj } from '../sim/mjcfFrames';
import { conj, quatMul } from '../sim/quat';
import { scanHits, type ScanSource } from './simTracks';

function source(rays: number): ScanSource {
  return {
    id: 'scan:lidar',
    name: 'LiDAR',
    owner: 'robot',
    body: 1,
    offset: 3,
    slot: 0,
    eye: {
      part: 'lidar',
      body: 'body',
      pos: [0.12, -0.34, 0.56],
      dirs: Array.from({ length: rays * 3 }, (_, i) => Math.sin(i * 0.71)),
      cols: rays,
      rows: 1,
      rangeM: 12,
    },
  };
}

function previousRotation(q: number[], v: ArrayLike<number>) {
  const r = quatMul(quatMul(q, [0, v[0], v[1], v[2]]), conj(q));

  return [r[1], r[2], r[3]];
}

function reference(scan: ScanSource, values: ArrayLike<number>, poses: ArrayLike<number>) {
  const { eye, body, offset } = scan;
  const o = body * 7;
  const q = [poses[o + 3], poses[o + 4], poses[o + 5], poses[o + 6]];
  const lens = previousRotation(q, eye.pos);
  const origin = [poses[o] + lens[0], poses[o + 1] + lens[1], poses[o + 2] + lens[2]];
  const out: number[] = [];

  for (let ray = 0; ray < eye.cols * eye.rows; ray++) {
    const value = values[offset + ray];

    if (value >= 1 || Number.isNaN(value)) continue;

    const d = previousRotation(q, [eye.dirs[ray * 3], eye.dirs[ray * 3 + 1], eye.dirs[ray * 3 + 2]]);
    const reach = value * eye.rangeM;

    out.push(...fromMj(origin[0] + d[0] * reach, origin[1] + d[1] * reach, origin[2] + d[2] * reach));
  }

  return Float32Array.from(out);
}

const ranges = [0, 0.2, 0.999, 1, 1.2, NaN, Infinity, -Infinity, -0.2, -0];

describe('recorded scan hit reconstruction', () => {
  it('matches quaternion reconstruction exactly across poses, layouts and range boundaries', () => {
    for (let seed = 0; seed < 80; seed++) {
      const scan = source(seed * 9 + 1);
      const poses = Float64Array.from({ length: 30 }, (_, i) => Math.sin(seed * 0.2 + i));
      const values = Float32Array.from({ length: scan.eye.cols + 8 }, (_, i) => ranges[(seed + i) % ranges.length]);

      scan.body = seed % 3;
      scan.offset = seed % 8;
      scan.eye.rows = (seed % 2) + 1;
      scan.eye.cols = Math.floor(scan.eye.cols / scan.eye.rows);

      const before = { scan: structuredClone(scan), poses: poses.slice(), values: values.slice() };

      expect(scanHits(scan, values, poses)).toEqual(reference(scan, values, poses));
      expect({ scan, poses, values }).toEqual(before);
    }
  });

  it('handles empty scans, misses, sparse ranges and typed-array views', () => {
    const poses = new Float64Array([99, 0, 0, 0, 1, 0, 0, 0, 99]).subarray(1, 8);
    const scan = { ...source(6), body: 0, offset: 0 };
    const values = [0.5, 0, 1, NaN, -0, 0.99];

    delete values[1];

    expect(scanHits(scan, values, poses)).toEqual(reference(scan, values, poses));
    expect(scanHits({ ...scan, eye: { ...scan.eye, cols: 0 } }, [], poses)).toEqual(new Float32Array());
    expect(scanHits(scan, [1, 1.1, Infinity, NaN, 1, NaN], poses)).toEqual(new Float32Array());
    expect(scanHits(scan, new Float32Array([99, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 99]).subarray(1, 7), poses)).toEqual(
      reference(scan, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(Math.fround), poses),
    );
  });

  it('keeps returned scans independent after body, lens, direction and range edits', () => {
    const scan = { ...source(720), body: 0, offset: 0 };
    const poses = [0, 0, 0, 1, 0, 0, 0];
    const values = new Float64Array(720).fill(0.5);
    const first = scanHits(scan, values, poses);
    const saved = first.slice();

    poses.splice(0, 7, 1, 2, 3, 0.5, -0.5, 0.5, -0.5);
    scan.eye.pos[0] += 1;
    scan.eye.dirs[0] = 1;
    scan.eye.rangeM = 4;
    values[1] = 1;

    const next = scanHits(scan, values, poses);

    expect(next).toEqual(reference(scan, values, poses));
    expect(next).not.toEqual(first);
    expect(first).toEqual(saved);
    expect(next.buffer.byteLength).toBe(next.byteLength);
    expect(first.buffer).not.toBe(next.buffer);
  });
});
