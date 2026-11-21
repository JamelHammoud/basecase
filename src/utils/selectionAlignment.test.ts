import { describe, expect, it } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import type { ScenePart } from '../types/robotics';
import { alignParts, partBounds, selectionBounds, type AlignMode, type Axis } from './selection';

const modes: AlignMode[] = ['min', 'center', 'max'];
const axes: Axis[] = [0, 1, 2];
const cases = axes.flatMap((axis) => modes.flatMap((mode) => [false, true].map((sheet) => ({ axis, mode, sheet }))));
const anchor = (bounds: ReturnType<typeof partBounds>, axis: Axis, mode: AlignMode) => {
  if (mode === 'min') return bounds.min[axis];

  return mode === 'max' ? bounds.max[axis] : (bounds.min[axis] + bounds.max[axis]) / 2;
};
const fixture = (index: number, sheet: boolean) =>
  sheetPart({
    id: `part-${index}`,
    position: [index * 17.3, index * -8.7, index * 11.1],
    rotation: [index * 13, index * -7, index * 19],
    sheetTransform: sheet ? [1, 0.2, 0, 0, 0, 1, 0.3, 0, 0.5, 0, 1, 0, 7, -3, 2, 1] : undefined,
  });

describe('alignment bounds reuse', () => {
  it.each(cases)('aligns $mode on axis $axis with sheet bounds $sheet', ({ axis, mode, sheet }) => {
    const selected = Array.from({ length: 64 }, (_, index) => fixture(index, sheet));
    const locked = sheetPart({ id: 'locked', locked: true });
    const unselected = sheetPart({ id: 'unselected' });
    const all = [locked, ...selected, unselected];
    const original = structuredClone(all);
    const target = anchor(selectionBounds(selected), axis, mode);
    const ids = [...selected.map((p) => p.id), 'locked', 'missing', selected[0].id];
    let dimensionReads = 0;

    for (const p of selected) {
      const dimensions = p.dimensions;

      Object.defineProperty(p, 'dimensions', {
        enumerable: true,
        get: () => {
          dimensionReads++;

          return dimensions;
        },
      });
    }

    const result = alignParts(all, ids, axis, mode);
    const reads = dimensionReads;

    expect(reads).toBe(selected.length * (sheet ? 2 : 4));
    expect(result[0]).toBe(locked);
    expect(result[result.length - 1]).toBe(unselected);
    expect(all).toEqual(original);

    result.slice(1, -1).forEach((p, index) => {
      expect(Math.abs(anchor(partBounds(p), axis, mode) - target)).toBeLessThan(0.050001);
      expect(p).not.toBe(selected[index]);
      expect(p.position.filter((_, i) => i !== axis)).toEqual(selected[index].position.filter((_, i) => i !== axis));
    });
  });

  it('reads current geometry on later calls and keeps single-part origin alignment', () => {
    const parts = [fixture(1, true), fixture(2, false)];
    const ids = parts.map((p) => p.id);
    const first = alignParts(parts, ids, 0, 'min');
    const edited = parts.map((p) => ({ ...p, dimensions: { ...p.dimensions, width: 170 } }));
    const target = selectionBounds(edited).min[0];
    const next = alignParts(edited, ids, 0, 'min');
    const [single] = alignParts(edited, [edited[0].id], 0, 'center');

    expect(next.map((p) => p.position)).not.toEqual(first.map((p) => p.position));
    expect(partBounds(next[0]).min[0]).toBeCloseTo(target, 10);
    expect(partBounds(next[1]).min[0]).toBeCloseTo(target, 10);
    expect(anchor(partBounds(single), 0, 'center')).toBeCloseTo(0, 10);
  });

  it('keeps a repeated object in a multi-part selection aligned to its bounds', () => {
    const p: ScenePart = fixture(1, false);
    const result = alignParts([p, p], [p.id], 0, 'min');

    expect(result.map((item) => item.position)).toEqual([p.position, p.position]);
  });
});
