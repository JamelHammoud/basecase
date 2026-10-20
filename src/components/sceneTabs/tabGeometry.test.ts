import { describe, expect, it } from 'vitest';
import { dragShift, dropIndex, TAB_GAP } from './tabGeometry';

const step = 100 + TAB_GAP;
const boxes = [0, 1, 2, 3].map((i) => ({ left: i * step, width: 100 }));

describe('tab drag geometry', () => {
  it('drops past the middle of a neighbour', () => {
    expect(dropIndex(boxes, 0, 40)).toBe(0);
    expect(dropIndex(boxes, 0, step - 50)).toBe(1);
    expect(dropIndex(boxes, 0, 3 * step - 50)).toBe(3);
    expect(dropIndex(boxes, 3, -(2 * step - 50))).toBe(1);
  });

  it('slides the tabs between the start and the drop point by one tab', () => {
    const far = 2 * step - 50;

    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 0, i, far))).toEqual([far, -step, -step, 0]);
    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 3, i, -far))).toEqual([0, step, step, -far]);
    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 1, i, 10))).toEqual([0, 10, 0, 0]);
  });
});
