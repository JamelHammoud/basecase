import { describe, expect, it } from 'vitest';
import { bomGroups } from '../components/build/buyLine';
import { bomCategories } from './bomCategories';
import { BOM_CATEGORIES, type BomLine } from './bomTypes';

const makeLine = (index: number, seed: number): BomLine => ({
  key: String(index),
  category: BOM_CATEGORIES[(index * 7 + seed) % BOM_CATEGORIES.length],
  name: `Item ${index}`,
  detail: '',
  qty: 1,
  owned: 0,
  toBuy: 1,
  unit: 'pcs',
  partIds: [],
  urlKind: 'none',
  status: index % 3 ? 'unchecked' : 'stale',
  lineUsd: index % 4 ? undefined : index / 10,
  estUsd: index % 5 ? undefined : index / 5,
  warning: index % 11 ? undefined : 'Choose a version',
});

const previousCategories = (lines: BomLine[]) =>
  BOM_CATEGORIES.map((category) => ({ category, lines: lines.filter((line) => line.category === category) })).filter(
    (group) => group.lines.length,
  );

function previousGroups(lines: BomLine[]) {
  return previousCategories(lines).map(({ category, lines: members }) => {
    const priced = members.map((line) => line.lineUsd ?? line.estUsd).filter((usd) => usd !== undefined);

    return {
      category,
      lines: members,
      usd: priced.length ? priced.reduce((sum, usd) => sum + usd, 0) : undefined,
      estimated: members.some((line) => line.lineUsd === undefined),
      attention: members.some((line) => line.warning || line.status === 'stale'),
    };
  });
}

describe('BOM category grouping', () => {
  it('preserves ordered categories, source rows and purchase summaries across mixed lists and edits', () => {
    for (let seed = 0; seed < 100; seed++) {
      const lines = Array.from({ length: seed * 3 }, (_, index) => makeLine(index, seed));
      const snapshot = structuredClone(lines);

      expect(bomCategories(lines)).toEqual(previousCategories(lines));
      expect(bomGroups({ lines })).toEqual(previousGroups(lines));
      expect(lines).toEqual(snapshot);

      lines.reverse();
      lines.push(makeLine(seed, seed + 1));
      lines[0].category = 'Equipment';
      expect(bomCategories(lines)).toEqual(previousCategories(lines));
      expect(bomGroups({ lines })).toEqual(previousGroups(lines));
    }
  });

  it('retains repeated row references and gives each call independent group arrays', () => {
    const line = makeLine(0, 0);
    const lines = [line, line];
    const first = bomCategories(lines);
    const second = bomCategories(lines);

    expect(first[0].lines).toEqual(lines);
    expect(first[0].lines[0]).toBe(line);
    expect(first[0].lines[1]).toBe(line);
    first[0].lines.pop();
    expect(second[0].lines).toEqual(lines);
    expect(lines).toHaveLength(2);
    expect(bomCategories([])).toEqual([]);
  });
});
