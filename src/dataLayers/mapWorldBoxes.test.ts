import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellKey, sortedCells } from './mapWorldCells';
import { mergeCells, type CellBox } from './mapWorldBoxes';

function boxCells(min: number[], max: number[]): number[][] {
  const cells: number[][] = [];

  for (let z = min[2]; z <= max[2]; z++)
    for (let y = min[1]; y <= max[1]; y++) for (let x = min[0]; x <= max[0]; x++) cells.push([x, y, z]);

  return cells;
}

function referenceFace(cells: Set<string>, box: CellBox, axis: number): boolean {
  const low = [...box.min];
  const high = [...box.max];

  low[axis] = box.max[axis] + 1;
  high[axis] = low[axis];

  return boxCells(low, high).every((cell) => cells.has(cellKey(cell)));
}

function referenceMerge(cells: Set<string>): CellBox[] {
  const remaining = new Set(cells);
  const boxes: CellBox[] = [];

  for (const min of sortedCells(cells)) {
    if (!remaining.has(cellKey(min))) continue;

    const box = { min, max: [...min] };

    for (let axis = 0; axis < 3; axis++) while (referenceFace(remaining, box, axis)) box.max[axis]++;

    for (const cell of boxCells(box.min, box.max)) remaining.delete(cellKey(cell));

    boxes.push(box);
  }

  return boxes;
}

function expectCoverage(cells: Set<string>, boxes: CellBox[]) {
  const covered = boxes.flatMap(({ min, max }) => boxCells(min, max).map(cellKey));

  expect(new Set(covered)).toEqual(cells);
  expect(covered).toHaveLength(cells.size);
}

const solid = (min: number[], max: number[]) => new Set(boxCells(min, max).map(cellKey));

afterEach(() => vi.restoreAllMocks());

describe('scan reconstruction box merging', () => {
  it('retains ordered boxes for every occupancy pattern in a two-cell cube', () => {
    const cube = boxCells([-1, -1, -1], [0, 0, 0]);

    for (let mask = 0; mask < 256; mask++) {
      const cells = new Set(cube.filter((_, i) => mask & (1 << i)).map(cellKey));
      const boxes = mergeCells(cells, 64);

      expect(boxes).toEqual(referenceMerge(cells));
      expectCoverage(cells, boxes);
      expect(mergeCells(new Set([...cells].reverse()), 64)).toEqual(boxes);
    }
  });

  it('keeps planar surfaces, measured volumes and gaps without overlaps or source edits', () => {
    const volume = boxCells([-3, -2, -1], [3, 2, 2]);

    for (let seed = 0; seed < 120; seed++) {
      const cells = new Set(
        volume.filter((point, i) => (i * 31 + seed * 17) % 23 < 16 && (seed % 3 || point[2] === 0)).map(cellKey),
      );
      const original = [...cells];
      const boxes = mergeCells(cells, cells.size);

      expect(boxes).toEqual(referenceMerge(cells));
      expectCoverage(cells, boxes);
      expect([...cells]).toEqual(original);
    }
  });

  it('reads changed occupancy and keeps separate calls and returned bounds independent', () => {
    const cells = solid([-2, -1, 0], [2, 3, 4]);
    const first = mergeCells(cells, 64);
    const saved = structuredClone(first);

    cells.delete('0,1,2');

    const second = mergeCells(cells, 64);

    expect(second).toEqual(referenceMerge(cells));
    expectCoverage(cells, second);
    second[0].min[0] = 100;
    second[0].max[0] = 200;
    expect(first).toEqual(saved);
    expect(mergeCells(cells, 64)).toEqual(referenceMerge(cells));
    expect(mergeCells(new Set(), 0)).toEqual([]);
  });

  it('retains exact piece budgets and leaves refused inputs intact', () => {
    const cells = new Set(Array.from({ length: 65 }, (_, i) => `${i * 2},0,0`));
    const original = [...cells];

    expect(() => mergeCells(cells, 64)).toThrow(/pieces budget of 64/);
    expect([...cells]).toEqual(original);
    cells.delete('128,0,0');
    expect(mergeCells(cells, 64)).toHaveLength(64);
    expect(() => mergeCells(cells, 63)).toThrow(/pieces budget/);
    expect(() => mergeCells(new Set(['0,0,0']), 0)).toThrow(/pieces budget/);
  });

  it.each([300, 600])('avoids coordinate-array joins during face checks and removal for %i cells', (count) => {
    const cells = solid([0, 0, 0], [9, 9, count / 100 - 1]);
    const join = vi.spyOn(Array.prototype, 'join');
    const expected = referenceMerge(cells);
    const previousJoins = join.mock.calls.length;

    join.mockClear();

    const boxes = mergeCells(cells, 64);
    const currentJoins = join.mock.calls.length;

    join.mockRestore();
    expect(boxes).toEqual(expected);
    expect(previousJoins).toBe(3 * count + 2);
    expect(currentJoins).toBe(count);
  });
});
