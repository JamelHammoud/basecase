import React, { useState } from 'react';
import { designLabel, sameDesign, type ExploredDesign } from '../../cases/explore';
import { Button, ChevronDownIcon, ChevronUpIcon, RowActions, Tooltip } from '../../design-system';
import { fmtG } from '../../utils/engineeringFormat';
import { useMoney } from '../../utils/useMoney';
import type { CaseExplore, Exploration } from '../../workspace/useCaseExplore';
import { ProgressBar } from './ProgressBar';
import { sortRows, type SortKey, type Sorting } from '../../cases/exploreSort';

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto_64px_56px] items-center gap-x-3';

const HEADERS: Array<{ key: SortKey; label: string }> = [
  { key: 'passes', label: 'Passes' },
  { key: 'cost', label: 'Cost' },
  { key: 'mass', label: 'Mass' },
];

const SortHeader: React.FC<{ sorting: Sorting; onSort: (key: SortKey) => void }> = ({ sorting, onSort }) => (
  <div className={`${GRID} h-8 text-[12px] text-white/50`}>
    <span />
    {HEADERS.map(({ key, label }) => {
      const on = sorting.key === key;
      const Arrow = sorting.descending ? ChevronDownIcon : ChevronUpIcon;

      return (
        <button
          key={key}
          type="button"
          className={`flex items-center justify-end gap-0.5 cursor-default hover:text-white/85 ${on ? 'text-white/85' : ''}`}
          aria-pressed={on}
          onClick={() => onSort(key)}
        >
          {label}
          {on && <Arrow className="w-3 h-3" />}
        </button>
      );
    })}
  </div>
);

interface RowProps {
  row: ExploredDesign;
  label: string;
  current: boolean;
  onApply: () => void;
}

const ExploreRow: React.FC<RowProps> = ({ row, label, current, onApply }) => {
  const money = useMoney();
  const { runs } = row;
  const passes = runs.refusal ?? `${runs.passes} of ${runs.runs}`;

  return (
    <div
      className={`${GRID} group relative h-8 -mx-1.5 px-1.5 rounded-[8px] text-[13px] hover:bg-white/[0.05]`}
      data-testid="explore-row"
      data-current={current}
    >
      <Tooltip label={label} className="min-w-0">
        <span className={`block truncate ${current ? 'text-[#0d99ff]' : 'text-white/85'}`}>{label}</span>
      </Tooltip>
      <Tooltip label={runs.refusal} disabled={!runs.refusal} className="min-w-0">
        <span className="block max-w-[96px] truncate tabular text-white/70" data-testid="explore-passes">
          {passes}
        </span>
      </Tooltip>
      <span className="text-right text-[12px] text-white/50 tabular">{money.format(row.costUsd)}</span>
      <span className="text-right text-[12px] text-white/50 tabular">{fmtG(row.massG)}</span>
      {!current && (
        <RowActions fill="#2a2a2a" className="inset-y-0 right-0 pr-1 rounded-r-[8px]">
          <Button size="xs" onClick={onApply}>
            Apply
          </Button>
        </RowActions>
      )}
    </div>
  );
};

const rowLabel = (shown: Exploration, row: ExploredDesign, sceneName: string) =>
  sameDesign(row.design, shown.space.current) ? sceneName : designLabel(shown.space, row.design);

export const ExploreRows: React.FC<{ explore: CaseExplore; sceneName: string }> = ({ explore, sceneName }) => {
  const [sorting, setSorting] = useState<Sorting>({ key: 'passes', descending: true });
  const { shown } = explore;

  if (!shown) return null;

  const onSort = (key: SortKey) =>
    setSorting((s) => (s.key === key ? { key, descending: !s.descending } : { key, descending: key === 'passes' }));

  return (
    <div className="flex flex-col mb-2" data-testid="case-explore">
      <SortHeader sorting={sorting} onSort={onSort} />
      {sortRows(shown.rows, sorting).map((row) => (
        <ExploreRow
          key={row.key}
          row={row}
          label={rowLabel(shown, row, sceneName)}
          current={explore.isCurrent(row)}
          onApply={() => explore.apply(row)}
        />
      ))}
      {shown.running && <ProgressBar share={shown.rows.length / Math.max(1, shown.total)} />}
    </div>
  );
};
