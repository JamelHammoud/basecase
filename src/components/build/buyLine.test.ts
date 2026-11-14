import { describe, expect, it } from 'vitest';
import type { BomLine } from '../../utils/bomTypes';
import { bomGroups, lineAmount, lineCount, ownedAmount } from './buyLine';

const line = (o: Partial<BomLine>): BomLine => ({
  key: 'k',
  category: 'Components',
  name: 'Servo',
  detail: '',
  qty: 2,
  owned: 0,
  toBuy: o.qty ?? 2,
  unit: 'pcs',
  partIds: [],
  urlKind: 'none',
  status: 'unchecked',
  ...o,
});

const record = { priceUsd: 10, packQty: 10, checkedAt: '2026-11-01' };

describe('bomGroups', () => {
  it('keeps the BOM order and leaves out empty categories', () => {
    const groups = bomGroups({
      lines: [line({ category: 'Filament', unit: 'g' }), line({ category: 'Components' })],
    });

    expect(groups.map((g) => g.category)).toEqual(['Components', 'Filament']);
  });

  it('sums checked and estimated prices, and marks the subtotal estimated', () => {
    const [group] = bomGroups({
      lines: [line({ lineUsd: 12.5, status: 'checked', record }), line({ estUsd: 3 })],
    });

    expect(group.usd).toBe(15.5);
    expect(group.estimated).toBe(true);
  });

  it('marks a subtotal exact only when every line has a checked price', () => {
    const [group] = bomGroups({ lines: [line({ lineUsd: 12.5, status: 'checked', record })] });

    expect(group.estimated).toBe(false);
  });

  it('has no subtotal when nothing is priced', () => {
    const [group] = bomGroups({ lines: [line({})] });

    expect(group.usd).toBeUndefined();
  });

  it('flags a group holding a warning or a stale price', () => {
    const groups = bomGroups({
      lines: [
        line({ warning: 'Choose a version' }),
        line({ category: 'Hardware', status: 'stale', record, lineUsd: 1 }),
        line({ category: 'Supplies' }),
      ],
    });

    expect(groups.map((g) => g.attention)).toEqual([true, true, false]);
  });
});

describe('line quantities', () => {
  it('counts pieces, with packs once a price sets the pack size', () => {
    expect(lineCount(line({ qty: 48 }))).toBe('48×');
    expect(lineAmount(line({ qty: 48, packs: 5, record }))).toBe('5 packs');
    expect(lineAmount(line({ qty: 48, packs: 5 }))).toBe('');
  });

  it('counts filament in spools, with the grams it needs', () => {
    const filament = line({ category: 'Filament', unit: 'g', qty: 1240, packs: 2 });

    expect(lineCount(filament)).toBe('2×');
    expect(lineAmount(filament)).toBe('1,240 g');
  });

  it('counts what is left to buy past the parts on hand, and keeps a fully owned line at $0', () => {
    expect(lineCount(line({ qty: 8, owned: 6, toBuy: 2 }))).toBe('2×');
    expect(ownedAmount(line({ qty: 8, owned: 6, toBuy: 2 }))).toBe('6 on hand');
    expect(ownedAmount(line({ unit: 'g', qty: 1240, owned: 1000, toBuy: 240 }))).toBe('1,000 g on hand');
    expect(ownedAmount(line({}))).toBe('');

    const owned = line({ qty: 13, owned: 13, toBuy: 0, packs: 0, lineUsd: 0 });
    const [group] = bomGroups({ lines: [owned] });

    expect(lineCount(owned)).toBe('0×');
    expect(group).toMatchObject({ usd: 0, estimated: false });
  });
});
