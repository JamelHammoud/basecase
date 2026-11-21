import { Button, Select } from '../../design-system';
import { runClock } from '../../utils/duration';
import type { Cases } from '../../workspace/useCases';

interface Props {
  cases: Cases;
  onBranch: () => void;
}

export function BranchTryControls({ cases, onBranch }: Props) {
  const { branch, timeline } = cases;

  if (!branch.points.length || timeline.comparison.active) return null;

  const selected = branch.points.some((point) => point.frame === timeline.frame);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="w-[112px]">
        <Select
          aria-label="Checkpoint"
          className="w-[112px]"
          value={selected ? String(timeline.frame) : ''}
          options={[
            ...(selected ? [] : [{ value: '', label: 'Checkpoint' }]),
            ...branch.points.map((point) => ({ value: String(point.frame), label: runClock(point.time) })),
          ]}
          onChange={(event) => timeline.seek(Number(event.target.value))}
        />
      </div>
      <Button variant="ghost" size="xs" disabled={!branch.available} onClick={onBranch}>
        Branch Try
      </Button>
    </div>
  );
}
