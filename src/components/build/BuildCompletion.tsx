import { Button } from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';
import { canRecordRepair } from '../../kit/buildRepairState';

export function BuildCompletion({ buildAlong }: { buildAlong: BuildAlong }) {
  if (!buildAlong.frozen || !buildAlong.count) return null;

  const progress = buildAlong.frozen.repair ?? buildAlong.frozen.record;
  const completed = !!progress.completed[String(buildAlong.index)];

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={buildAlong.saving || buildAlong.opening || (!!buildAlong.frozen.record.repairs?.length && !canRecordRepair(buildAlong.frozen.record, buildAlong.frozen.repair))}
      onClick={() => void buildAlong.complete()}
    >
      {completed ? 'Mark Incomplete' : 'Complete Step'}
    </Button>
  );
}
