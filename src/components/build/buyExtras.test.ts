import { describe, expect, it } from 'vitest';
import { withAdded, withQty, without } from './buyExtras';

const extras = [
  { key: 'supply:xt60', qty: 2, note: 'spares' },
  { key: 'supply:charger', qty: 1 },
];

describe('supplies added by hand', () => {
  it('adds a new supply once, and counts up one already listed', () => {
    expect(withAdded(extras, 'supply:fuse').at(-1)).toEqual({ key: 'supply:fuse', qty: 1 });
    expect(withAdded(extras, 'supply:xt60')[0]).toEqual({ key: 'supply:xt60', qty: 3, note: 'spares' });
  });

  it('sets a whole quantity of at least 1, keeping the note', () => {
    expect(withQty(extras, 'supply:xt60', 4.6)[0]).toEqual({ key: 'supply:xt60', qty: 5, note: 'spares' });
    expect(withQty(extras, 'supply:xt60', 0)[0].qty).toBe(1);
  });

  it('removes only the one supply', () => {
    expect(without(extras, 'supply:xt60')).toEqual([{ key: 'supply:charger', qty: 1 }]);
  });
});
