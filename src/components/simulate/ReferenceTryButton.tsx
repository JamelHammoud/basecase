import { Button, RunIcon } from '../../design-system';
import type { Cases } from '../../workspace/useCases';

export function ReferenceTryButton({ cases }: { cases: Cases }) {
  const { attempt, active, realTry } = cases;

  if (attempt.phase !== 'idle' || realTry.phase !== 'idle' || !active?.reference.timeline.length) return null;

  return (
    <Button
      variant="secondary"
      size="md"
      fullWidth
      icon={<RunIcon className="w-4 h-4" />}
      onClick={() => void attempt.reference()}
    >
      Try Reference
    </Button>
  );
}
