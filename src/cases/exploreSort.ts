import type { ExploredDesign } from './explore';

export type SortKey = 'passes' | 'cost' | 'mass';

export interface Sorting {
  key: SortKey;
  descending: boolean;
}

const passRate = ({ runs }: ExploredDesign) => (runs.refusal || !runs.runs ? -1 : runs.passes / runs.runs);

const VALUE: Record<SortKey, (row: ExploredDesign) => number> = {
  passes: passRate,
  cost: (row) => row.costUsd,
  mass: (row) => row.massG,
};

const TIES: SortKey[] = ['passes', 'cost', 'mass'];

const better = (key: SortKey, a: ExploredDesign, b: ExploredDesign) =>
  key === 'passes' ? VALUE.passes(b) - VALUE.passes(a) : VALUE[key](a) - VALUE[key](b);

export function sortRows(rows: ExploredDesign[], { key, descending }: Sorting): ExploredDesign[] {
  const sign = descending === (key === 'passes') ? 1 : -1;

  return rows
    .map((row, at) => ({ row, at }))
    .sort((a, b) => {
      const first = sign * better(key, a.row, b.row);
      const tie = TIES.filter((k) => k !== key).reduce((found, k) => found || better(k, a.row, b.row), 0);

      return first || tie || a.at - b.at;
    })
    .map(({ row }) => row);
}
