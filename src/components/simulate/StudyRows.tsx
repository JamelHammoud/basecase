import { useState } from 'react';
import { paretoFrontier } from '../../study/study';
import type { StudyRow } from '../../study/types';
import type { Study } from '../../workspace/useStudy';
import { StudyPlot } from './StudyPlot';
import { StudyResultRow } from './StudyResultRow';
import { StudySortHeader, type StudySort } from './StudySortHeader';
import { toggleCompared, type StudyMetric } from './studyView';

export function StudyRows({ study }: { study: Study }) {
  const [axes, setAxes] = useState<[StudyMetric, StudyMetric, StudyMetric]>(['cost', 'mass', 'torque']);
  const [compared, setCompared] = useState<string[]>([]);
  const [sorting, setSorting] = useState<{ key: StudySort; descending: boolean }>({ key: 'passes', descending: true });
  const rows = study.shown?.rows ?? [];
  const score = (row: StudyRow) => row.runs?.passes ?? -row.checks.filter((c) => c.status === 'fail').length;
  const value = (row: StudyRow) => ({ passes: score(row), cost: row.costUsd, mass: row.massG })[sorting.key];
  const ordered = [...rows].sort((a, b) => (value(a) - value(b)) * (sorting.descending ? -1 : 1));
  const selected = rows.filter((r) => compared.includes(r.key));
  const onPick = (row: StudyRow, shift: boolean) =>
    setCompared((s) => (shift ? toggleCompared(s, row.key) : [row.key]));
  const rowFor = (row: StudyRow) => (
    <StudyResultRow
      key={row.key}
      row={row}
      current={study.isCurrent(row)}
      selected={compared.includes(row.key)}
      stale={study.stale}
      onApply={() => void study.apply(row)}
      onPreview={study.preview}
      onPick={(shift) => onPick(row, shift)}
    />
  );

  return (
    <div data-testid="study-results">
      {study.caseLabel && <p className="text-[13px] text-white/60 mb-2">{study.caseLabel}</p>}
      {study.stale && (
        <p className="text-[13px] text-white/60 mb-2">The scene changed. Run Study again to apply a design.</p>
      )}
      <StudyPlot
        rows={rows}
        axes={axes}
        onAxis={(axis, metric) => setAxes((s) => s.map((v, i) => (i === axis ? metric : v)) as typeof s)}
        compared={compared}
        frontier={paretoFrontier(rows)}
        onPreview={study.preview}
        onPick={onPick}
      />
      {selected.length > 1 && (
        <div className="mb-3" data-testid="study-compare">
          {selected.map(rowFor)}
        </div>
      )}
      <StudySortHeader
        sorting={sorting.key}
        descending={sorting.descending}
        onSort={(key) => setSorting((s) => ({ key, descending: s.key === key ? !s.descending : key === 'passes' }))}
      />
      <div role="table" aria-label="Study designs">
        {ordered.map(rowFor)}
      </div>
    </div>
  );
}
