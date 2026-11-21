import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from './seededRandom';
import { distanceToEdge, fitTarget } from './targetFit';
import { fitDetail, placeModel } from './viewFit';

function previousDistances(cells: Uint8Array, width: number, height: number): Float32Array {
  const distances = new Float32Array(width * height).fill(1e9);

  for (let i = width; i < width * (height - 1); i++) {
    const x = i % width;

    if (
      cells[i] &&
      (x === 0 || x === width - 1 || !cells[i - 1] || !cells[i + 1] || !cells[i - width] || !cells[i + width])
    )
      distances[i] = 0;
  }

  const step = (i: number, j: number, cost: number) => {
    if (distances[j] + cost < distances[i]) distances[i] = distances[j] + cost;
  };

  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;

      step(i, i - 1, 1);
      step(i, i - width, 1);
      step(i, i - width - 1, Math.SQRT2);
      step(i, i - width + 1, Math.SQRT2);
    }

  for (let y = height - 2; y > 0; y--)
    for (let x = width - 2; x > 0; x--) {
      const i = y * width + x;

      step(i, i + 1, 1);
      step(i, i + width, 1);
      step(i, i + width + 1, Math.SQRT2);
      step(i, i + width - 1, Math.SQRT2);
    }

  return distances;
}

const bytes = (values: Float32Array) => Buffer.from(values.buffer, values.byteOffset, values.byteLength);

function expectDistances(cells: Uint8Array, width: number, height: number) {
  const saved = cells.slice();
  const expected = previousDistances(cells, width, height);
  const actual = distanceToEdge(cells, width, height);

  expect(bytes(actual).equals(bytes(expected))).toBe(true);
  expect(cells).toEqual(saved);

  return actual;
}

function gapValues(target: Uint8Array, model: Uint8Array, width: number, height: number) {
  const toTarget = previousDistances(target, width, height);
  const toModel = previousDistances(model, width, height);
  let sum = 0;
  let count = 0;
  let max = 0;

  for (let i = 0; i < target.length; i++) {
    const values = [toTarget[i] === 0 && target[i] ? toModel[i] : -1, toModel[i] === 0 && model[i] ? toTarget[i] : -1];

    for (const value of values) {
      if (value < 0) continue;

      sum += value;
      count++;
      max = Math.max(max, value);
    }
  }

  return { mean: count ? sum / count : 0, max };
}

function countedDistances(run: () => Float32Array) {
  let reads = 0;
  let writes = 0;
  const constructor = new Proxy(Float32Array, {
    construct(target, args) {
      const values = Reflect.construct(target, args) as Float32Array;
      const counted = new Proxy(values, {
        get(array, key) {
          if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

          if (key === 'fill')
            return (value: number) => {
              array.fill(value);

              return counted;
            };

          return Reflect.get(array, key, array);
        },
        set(array, key, value) {
          if (typeof key === 'string' && /^\d+$/.test(key)) writes++;

          return Reflect.set(array, key, value, array);
        },
      });

      return counted;
    },
  });

  vi.stubGlobal('Float32Array', constructor);

  try {
    const result = run();

    return { result, reads, writes };
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('shared outline distance propagation', () => {
  it('matches every binary pattern on nine grids through twelve cells, including narrow and empty grids', () => {
    for (const [width, height] of [
      [0, 0],
      [1, 1],
      [1, 8],
      [8, 1],
      [2, 4],
      [4, 2],
      [3, 3],
      [3, 4],
      [4, 3],
    ]) {
      for (let pattern = 0; pattern < 2 ** (width * height); pattern++) {
        const cells = Uint8Array.from({ length: width * height }, (_, i) => (pattern >>> i) & 1);

        expectDistances(cells, width, height);
      }
    }
  });

  it('preserves every Float32 distance across generated masks, source views and later edits', () => {
    const random = seededRandom('fd91a12ae34278190512458c81367abc');

    for (let trial = 0; trial < 160; trial++) {
      const width = 3 + Math.floor(random() * 78);
      const height = 3 + Math.floor(random() * 78);
      const buffer = new Uint8Array(width * height + 14);
      const cells = buffer.subarray(7, buffer.length - 7);

      cells.set(Uint8Array.from(cells, () => (random() < trial / 160 ? 255 : 0)));

      const first = expectDistances(cells, width, height);
      const saved = first.slice();

      cells[Math.floor(random() * cells.length)] ^= 255;

      const second = expectDistances(cells, width, height);

      expect(second.buffer).not.toBe(first.buffer);
      expect(first).toEqual(saved);
      expect(buffer.subarray(0, 7)).toEqual(new Uint8Array(7));
      expect(buffer.subarray(buffer.length - 7)).toEqual(new Uint8Array(7));
    }
  });

  it('preserves long diagonal rounding and edges on the outer columns', () => {
    const width = 513;
    const height = 509;
    const cells = new Uint8Array(width * height);

    cells[width + 1] = 1;
    cells[(height - 2) * width + width - 2] = 255;
    expectDistances(cells, width, height);
    cells.fill(1);
    expectDistances(cells, width, height);
  });

  it('preserves sketch and camera comparison gaps', () => {
    const random = seededRandom('fd91a12ae34278190512458c81367abc');

    for (let trial = 0; trial < 20; trial++) {
      const width = 12 + trial;
      const height = 15 + trial;
      const target = { width, height, data: Uint8Array.from({ length: width * height }, () => Number(random() > 0.4)) };
      const model = { ...target, data: Uint8Array.from(target.data, () => Number(random() > 0.6)) };
      const fit = fitTarget({ target, model: { mask: model, mmPerPx: 0.75 }, targetMmPerPx: 1.25 })!;
      const { grid } = fit;
      const sketchGap = gapValues(grid.target, grid.model, grid.width, grid.height);
      const align = { iou: 0, roll: trial - 10, scale: 1.25, dx: trial % 3, dy: trial % 4 };
      const camera = fitDetail(target, model, align);
      const cameraGap = gapValues(target.data, placeModel(target, model, align), width, height);

      expect(fit.gapMeanMm).toBe(sketchGap.mean * grid.cellMm);
      expect(fit.gapMaxMm).toBe(sketchGap.max * grid.cellMm);
      expect(camera.contourPx).toBe(cameraGap.mean);
    }
  });

  it.each([300, 600])('reduces distance reads in a %s-column empty mask without adding writes', (width) => {
    const height = 10;
    const cells = new Uint8Array(width * height);
    const previous = countedDistances(() => previousDistances(cells, width, height));
    const current = countedDistances(() => distanceToEdge(cells, width, height));
    const interior = (width - 2) * (height - 2);

    expect(bytes(current.result).equals(bytes(previous.result))).toBe(true);
    expect(previous.reads).toBe(16 * interior);
    expect(current.reads).toBe(10 * interior);
    expect(previous.writes).toBe(0);
    expect(current.writes).toBe(0);
  });
});
