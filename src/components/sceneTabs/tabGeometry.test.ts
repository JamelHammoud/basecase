import { describe, expect, it } from 'vitest';
import { dragShift, dropIndex } from './tabGeometry';

const boxes = [0, 1, 2, 3].map((i) => ({ left: i * 102, width: 100 }));

describe('tab drag geometry', () => {
  it('drops past the middle of a neighbour', () => {
    expect(dropIndex(boxes, 0, 40)).toBe(0);
    expect(dropIndex(boxes, 0, 52)).toBe(1);
    expect(dropIndex(boxes, 0, 260)).toBe(3);
    expect(dropIndex(boxes, 3, -160)).toBe(1);
  });

  it('slides the tabs between the start and the drop point by one tab', () => {
    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 0, i, 160))).toEqual([160, -102, -102, 0]);
    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 3, i, -200))).toEqual([0, 102, 102, -200]);
    expect([0, 1, 2, 3].map((i) => dragShift(boxes, 1, i, 10))).toEqual([0, 10, 0, 0]);
  });
});
