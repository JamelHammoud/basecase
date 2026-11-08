import { IconButton, PlusIcon, PopoverMenu } from '../../design-system';
import type { InsertPoint } from '../../routines/edit';
import { stepChoices } from '../../routines/stepMenu';
import { AddStepMenu } from './AddStepMenu';
import { useEditorContext } from './editorContext';

const BRANCH_WORDS: Partial<Record<InsertPoint['kind'], string>> = { then: 'Yes', else: 'No' };

export function InsertButton({ point }: { point: InsertPoint }) {
  const { editor, routine, skills } = useEditorContext();
  const open = editor.adding === point.key;
  const word = point.to === null ? BRANCH_WORDS[point.kind] : undefined;

  return (
    <span className="relative flex items-center gap-1 nodrag nopan pointer-events-auto">
      {word && <span className="text-[12px] text-white/45 select-none">{word}</span>}
      <IconButton
        size="xs"
        className="rounded-full bg-[#2a2a2a] hover:bg-[#333333]"
        icon={<PlusIcon className="w-3.5 h-3.5" />}
        title="Add step"
        aria-expanded={open}
        aria-haspopup="menu"
        data-insert={point.key}
        onClick={() => editor.setAdding(open ? null : point.key)}
      />
      <PopoverMenu isOpen={open} onClose={() => editor.setAdding(null)} position="right" align="start">
        <AddStepMenu
          choices={stepChoices({ routine, at: point.at, skills })}
          onPick={(choice) => editor.add(choice.make(routine, point.at))}
        />
      </PopoverMenu>
    </span>
  );
}
