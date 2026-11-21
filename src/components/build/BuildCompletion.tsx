import { Button } from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';

export function BuildCompletion({ buildAlong }: { buildAlong: BuildAlong }) {
  if (!buildAlong.frozen || !buildAlong.count) return null;

  const progress = buildAlong.frozen.repair ?? buildAlong.frozen.record;
  const completed = !!progress.completed[String(buildAlong.index)];

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={buildAlong.saving || buildAlong.opening || buildAlong.frozen.repair?.state === 'complete' || (!buildAlong.frozen.repair && !!buildAlong.frozen.record.repairs?.length)}
      onClick={() => void buildAlong.complete()}
    >
      {completed ? 'Mark Incomplete' : 'Complete Step'}
    </Button>
  );
}
