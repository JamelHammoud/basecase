import { DeleteIcon, IconButton } from '../../design-system';
import { stepTitle } from '../../routines/flowLabels';
import type { Flow } from '../../routines/flowTypes';
import { useEditorContext } from './editorContext';
import { LogicFields } from './LogicFields';
import { MoveFields } from './MoveFields';

const MOVE_KINDS = new Set(['base', 'do']);

export function StepPanel({ flow }: { flow: Flow }) {
  const { editor, routine, skills } = useEditorContext();
  const node = flow.nodes.find((n) => n.id === editor.selected);

  if (!node) return null;

  const props = {
    node,
    routine,
    skills,
    update: (patch: Record<string, unknown>) => editor.update(node.id, patch),
    apply: editor.apply,
  };

  return (
    <div
      data-testid="routine-step"
      className="shrink-0 max-h-[45%] overflow-y-auto border-t border-white/[0.06] px-[12px] [--pad-x:12px] py-3 flex flex-col gap-2"
    >
      <div className="h-[28px] flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-white/90 truncate">{stepTitle(node)}</span>
        {node.kind !== 'base' && (
          <IconButton
            size="xs"
            variant="danger"
            icon={<DeleteIcon className="w-4 h-4" />}
            title="Delete step"
            shortcut="⌫"
            onClick={() => editor.remove(node.id)}
          />
        )}
      </div>
      {MOVE_KINDS.has(node.kind) ? <MoveFields {...props} /> : <LogicFields {...props} />}
    </div>
  );
}
