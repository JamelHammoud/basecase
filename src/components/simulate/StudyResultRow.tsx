import { Button, RowActions, Tooltip } from '../../design-system';
import type { StudyRow } from '../../study/types';
import { useMoney } from '../../utils/useMoney';
import { weight } from '../../utils/weight';

interface StudyResultRowProps {
  row: StudyRow;
  current: boolean;
  selected: boolean;
  stale: boolean;
  onApply: () => void;
  onPreview: (row: StudyRow | null) => void;
  onPick: (shift: boolean) => void;
}

export function StudyResultRow({ row, current, selected, stale, onApply, onPreview, onPick }: StudyResultRowProps) {
  const money = useMoney();
  const passes = row.checks.filter((c) => c.status === 'pass').length;
  const status = row.runs ? `${row.runs.passes} of ${row.runs.runs}` : `${passes} of ${row.checks.length}`;

  return (
    <div
      role="row"
      tabIndex={0}
      className={`group relative grid grid-cols-[minmax(0,1fr)_64px_56px_56px] items-center gap-x-2 min-h-[32px] -mx-1.5 px-1.5 rounded-lg text-[13px] cursor-default ${selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
      data-testid="study-row"
      data-current={current}
      aria-selected={selected}
      onMouseEnter={() => onPreview(row)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(row)}
      onBlur={() => onPreview(null)}
      onClick={(e) => onPick(e.shiftKey)}
      onKeyDown={(e) => e.key === 'Enter' && onPick(e.shiftKey)}
    >
      <Tooltip label={row.label} className="min-w-0">
        <span className={`block truncate ${current ? 'text-[#0d99ff]' : 'text-white/90'}`}>{row.label}</span>
      </Tooltip>
      <Tooltip
        label={
          row.error ??
          row.runs?.refusal ??
          row.checks
            .filter((check) => check.status !== 'pass')
            .map((check) => `${check.check}: ${check.detail}`)
            .join('\n')
        }
      >
        <span className="block text-right text-[12px] text-white/60 tabular">{row.error ? 'Failed' : status}</span>
      </Tooltip>
      <span className="text-right text-[12px] text-white/50 tabular">
        {row.error ? '—' : money.format(row.costUsd)}
      </span>
      <span className="text-right text-[12px] text-white/50 tabular">{row.error ? '—' : weight(row.massG)}</span>
      {!current && (
        <RowActions fill="#2a2a2a" className="inset-y-0 right-0 pr-1 rounded-r-lg">
          <Button
            size="xs"
            disabled={stale || !!row.error}
            onClick={(e) => {
              e.stopPropagation();
              onApply();
            }}
          >
            Apply
          </Button>
        </RowActions>
      )}
    </div>
  );
}
