import { expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { worldItem } from './schema';
import { selectedPickObject } from './selectedPick';
import { withoutWorldSources } from './sourceParts';

it('replaces only declared scene sources while preserving the original parts for closing the Case', () => {
  const parts = [box('target', [0, 10, 0], [20, 20, 20], 12), box('spot', [40, 10, 0], [20, 20, 20], 12)];
  const world = [{ ...parts[0], sourcePartId: 'target' }];

  expect(withoutWorldSources(parts, world)).toEqual([parts[1]]);
  expect(withoutWorldSources(parts, [parts[1]])).toBe(parts);
  expect(withoutWorldSources(parts, [])).toBe(parts);
  expect(parts).toHaveLength(2);
});

it('discards serialized source aliases before ordinary world staging assigns explicit selected-object identity', () => {
  const target = {
    ...box('target', [0, 10, 0], [20, 20, 20], 12),
    physics: { dynamic: true, friction: 0.8 },
    sourcePartId: 'robot-base',
  };

  expect(worldItem(selectedPickObject(target)).sourcePartId).toBeUndefined();
  expect(selectedPickObject(target).geometry).toEqual(target);
});
