import { Button } from '../../design-system';
import type { Cases } from '../../workspace/useCases';

export function CaseTeachingControls({ cases, busy, running }: { cases: Cases; busy: boolean; running: boolean }) {
  const { attempt } = cases;

  if (running && attempt.owner)
    return (
      <Button fullWidth onClick={() => void attempt.handoff?.()}>
        {attempt.owner === 'operator' ? 'Resume Policy' : 'Take Control'}
      </Button>
    );

  if (!cases.canTeach || busy) return null;

  return (
    <Button fullWidth onClick={() => void attempt.teach?.()}>
      Try Policy
    </Button>
  );
}
