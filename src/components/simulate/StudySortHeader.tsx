import { Button, ChevronDownIcon, ChevronUpIcon } from '../../design-system';

export type StudySort = 'passes' | 'cost' | 'mass';

const HEADERS: Array<{ key: StudySort; label: string }> = [
  { key: 'passes', label: 'Checks' },
  { key: 'cost', label: 'Cost' },
  { key: 'mass', label: 'Weight' },
];

export function StudySortHeader({
  sorting,
  descending,
  onSort,
  caseRuns,
  visibility,
}: {
  sorting: StudySort;
  descending: boolean;
  onSort: (key: StudySort) => void;
  caseRuns: boolean;
  visibility?: boolean;
}) {
  const countLabel = visibility ? 'Visibility' : 'Checks';
  const resultLabel = caseRuns ? 'Case passes' : countLabel;
  const Arrow = descending ? ChevronDownIcon : ChevronUpIcon;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_64px_56px_56px] items-center gap-x-2 text-[12px] text-white/50">
      <span />
      {HEADERS.map(({ key, label }) => (
        <Button key={key} size="xs" variant="ghost" aria-pressed={sorting === key} onClick={() => onSort(key)}>
          {key === 'passes' ? resultLabel : label}
          {sorting === key && <Arrow className="w-3 h-3" />}
        </Button>
      ))}
    </div>
  );
}
