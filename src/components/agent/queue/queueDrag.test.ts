import { describe, expect, it } from 'vitest';
import { dropTarget, QUEUE_GAP_PX, QUEUE_ROW_PX, rowTop } from './queueDrag';

const step = QUEUE_ROW_PX + QUEUE_GAP_PX;

describe('queue drag', () => {
  it('moves a row once it covers half of its neighbour', () => {
    expect(dropTarget(rowTop(1) + 10, 4, 1)).toBe(1);
    expect(dropTarget(rowTop(1) + step * 0.6, 4, 1)).toBe(2);
    expect(dropTarget(rowTop(1) - step * 0.4, 4, 1)).toBe(1);
    expect(dropTarget(rowTop(1) - step * 0.6, 4, 1)).toBe(0);
  });

  it('clamps past either end of the list', () => {
    expect(dropTarget(-500, 3, 2)).toBe(0);
    expect(dropTarget(5000, 3, 0)).toBe(2);
  });
});
