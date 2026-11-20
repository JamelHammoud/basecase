import { Button } from '../../design-system';
import type { BuildAlong } from '../../workspace/useBuildAlong';

export function BuildCompletion({ buildAlong }: { buildAlong: BuildAlong }) {
  if (!buildAlong.frozen) return null;

  const completed = !!buildAlong.frozen.record.completed[String(buildAlong.index)];

  return (
    <Button size="sm" variant="ghost" disabled={buildAlong.saving} onClick={() => void buildAlong.complete()}>
      {completed ? 'Mark Incomplete' : 'Complete Step'}
    </Button>
  );
}
