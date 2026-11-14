import { describe, expect, it } from 'vitest';
import { dropAt, type AreaBox } from './dropTarget';

const left: AreaBox = {
  at: 0,
  left: 8,
  right: 408,
  top: 52,
  bottom: 852,
  panels: [{ id: 'cameras', top: 52, bottom: 452 }],
};
const right: AreaBox = {
  at: 2,
  left: 1000,
  right: 1328,
  top: 52,
  bottom: 852,
  panels: [
    { id: 'brief', top: 100, bottom: 200 },
    { id: 'speed', top: 200, bottom: 400 },
  ],
};

describe('where a dragged panel lands', () => {
  it('goes before the panel whose upper half it is over, or at the end of the area', () => {
    expect(dropAt([left, right], 1100, 150)?.drop).toEqual({ area: 2, before: 'speed' });
    expect(dropAt([left, right], 1100, 120)?.drop).toEqual({ area: 2, before: 'brief' });
    expect(dropAt([left, right], 200, 700)).toMatchObject({ drop: { area: 0 }, line: { y: 451, height: 2 } });
  });

  it('makes a new column at either edge of an area, and nothing between areas', () => {
    expect(dropAt([left, right], 1010, 300)).toMatchObject({ drop: { column: 2 }, line: { x: 1000, width: 2 } });
    expect(dropAt([left, right], 400, 300)).toMatchObject({ drop: { column: 1 }, line: { x: 406, width: 2 } });
    expect(dropAt([left, right], 700, 300)).toBeNull();
  });
});
