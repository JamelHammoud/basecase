import { Button } from '../../design-system';
import type { RefusedHandoff } from '../../routines/handoffs';
import { useEditorContext } from './editorContext';

export function HandoffFixes({ id, handoff }: { id: string; handoff: RefusedHandoff }) {
  const { editor, handoffs, trainable } = useEditorContext();
  const busy = handoffs.busy !== null;
  const proved = handoff.falls !== null;
  const fix = (run: (pair: RefusedHandoff, node: string) => Promise<unknown>) => () => void run(handoff, id);

  return (
    <div className="mt-1 flex flex-wrap gap-1 nodrag">
      {!proved && (
        <Button size="xs" variant="secondary" disabled={busy} onClick={fix(handoffs.prove)}>
          Prove
        </Button>
      )}
      {proved && trainable.has(handoff.to) && (
        <Button size="xs" variant="secondary" disabled={busy} onClick={fix(handoffs.train)}>
          Train Hand-off
        </Button>
      )}
      <Button size="xs" variant="secondary" disabled={busy} onClick={() => editor.stopBefore(id)}>
        Stop First
      </Button>
    </div>
  );
}
