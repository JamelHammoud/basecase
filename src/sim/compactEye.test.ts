import { describe, expect, it } from 'vitest';
import { compactEye, type Eye } from './eyes';

const sensor = (dirs: number[]): Eye => ({
  part: 'sensor',
  body: 'head',
  pos: [0.1, -0.2, 0.3],
  dirs,
  cols: dirs.length / 3,
  rows: 1,
  rangeM: 4,
});

function previousDirections(eye: Eye) {
  const index: number[] = [];
  const dirs: number[] = [];

  for (let i = 0; i < eye.cols * eye.rows; i++) {
    const d = eye.dirs.slice(i * 3, i * 3 + 3);

    if (d[0] === 0 && d[1] === 0 && d[2] === 0) continue;

    index.push(i);
    dirs.push(...d);
  }

  return { index, dirs };
}

describe('sensor direction compaction', () => {
  it.each([0, 1, 192, 720, 768, 4096])('preserves ordered directions and pixel indices for %i rays', (rays) => {
    const dirs = Array.from({ length: rays }, (_, i) =>
      i % 5 === 0 ? [0, -0, 0] : [Math.sin(i), Math.cos(i), i % 2 ? -0 : 0.5],
    ).flat();
    const eye = sensor(dirs);
    const original = structuredClone(eye);

    Object.freeze(dirs);

    const compact = compactEye(eye, 7);

    expect({ index: compact.index, dirs: compact.dirs }).toEqual(previousDirections(eye));
    expect(compact.body).toBe(7);
    expect(compact.pos).toBe(eye.pos);
    expect(compact.rangeM).toBe(eye.rangeM);
    expect(compact.rays).toBe(rays);
    expect(compact.world).toEqual({ origin: [0, 0, 0], dirs: new Array(compact.dirs.length).fill(0) });
    expect(eye).toEqual(original);
  });

  it('retains nonfinite components and gives each setup independent direction storage', () => {
    const eye = sensor([NaN, 0, 0, 0, Infinity, -Infinity, -0, -0, 0, 1, -0, 0]);
    const first = compactEye(eye, 2);
    const saved = structuredClone(first);

    expect({ index: first.index, dirs: first.dirs }).toEqual(previousDirections(eye));
    eye.dirs[0] = 2;

    const second = compactEye(eye, 3);

    second.dirs[0] = 3;
    second.index[0] = 9;
    second.world.origin[0] = 4;
    second.world.dirs[0] = 5;
    expect(first).toEqual(saved);
    expect(eye.dirs[0]).toBe(2);
  });
});
