import { describe, expect, it } from 'vitest';
import { boardPoint, placedArea } from './boardCoordinates';
import type { BoardPlacement } from './boardTypes';

const placement: BoardPlacement = {
  id: 'connector',
  productId: 'jst-b3b-eh-a',
  position: [10, 20],
  rotation: 0,
  locked: true,
  bindings: [],
};

describe('board coordinates in a fixed scene frame', () => {
  it.each([
    [0, [12, 23], [12, 17]],
    [90, [7, 22], [13, 22]],
    [180, [8, 17], [8, 23]],
    [270, [13, 18], [7, 18]],
  ] as const)('places top and bottom pads at %s degrees', (rotation, top, bottom) => {
    expect(boardPoint({ ...placement, rotation }, [2, 3], 'top')).toEqual(top);
    expect(boardPoint({ ...placement, rotation }, [2, 3], 'bottom')).toEqual(bottom);
  });

  it('mirrors asymmetric access limits before rotating the component', () => {
    const area = { min: [-3, -2], max: [8, 4] } as const;
    const item = { ...placement, rotation: 90 as const };

    expect(placedArea(item, { min: [...area.min], max: [...area.max] }, 'top')).toEqual({
      id: 'connector',
      min: [6, 17],
      max: [12, 28],
    });
    expect(placedArea(item, { min: [...area.min], max: [...area.max] }, 'bottom')).toEqual({
      id: 'connector',
      min: [8, 17],
      max: [14, 28],
    });
  });
});
