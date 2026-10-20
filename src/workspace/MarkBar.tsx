import { Button, FloatingIsland, IconButton, IslandDivider, DeleteIcon, EraserIcon } from '../design-system';
import { MarkColors } from './MarkColors';
import { MarkLabelField } from './MarkLabelField';
import { markCount, type Marks } from './useMarks';

interface MarkBarProps {
  marks: Marks;
  onDone: () => void;
}

function SelectedMark({ marks }: { marks: Marks }) {
  const mark = marks.selected!;

  return (
    <>
      <MarkLabelField
        key={mark.id}
        label={mark.label ?? ''}
        autoFocus={marks.freshId === mark.id}
        onCommit={(label) => marks.setLabel(mark.id, label)}
      />
      <IconButton
        icon={<DeleteIcon className="w-4 h-4" />}
        title="Delete mark"
        shortcut="⌫"
        tooltipSide="top"
        className="rounded-full"
        onClick={() => marks.remove(mark.id)}
      />
    </>
  );
}

function AllMarks({ marks }: { marks: Marks }) {
  const count = marks.marks.length;

  return (
    <>
      <span className="text-[13px] font-medium text-white/85 tabular px-1.5 whitespace-nowrap">
        {count ? markCount(count) : 'Annotate'}
      </span>
      {count > 0 && (
        <IconButton
          icon={<EraserIcon className="w-4 h-4" />}
          title="Clear marks"
          tooltipSide="top"
          className="rounded-full"
          onClick={marks.clear}
        />
      )}
    </>
  );
}

export function MarkBar({ marks, onDone }: MarkBarProps) {
  return (
    <FloatingIsland className="pointer-events-auto h-10 pl-1 pr-1 gap-1 rounded-full animate-pop-up">
      <MarkColors value={marks.color} onChange={marks.setColor} />
      <IslandDivider />
      {marks.selected ? <SelectedMark marks={marks} /> : <AllMarks marks={marks} />}
      <IslandDivider />
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full"
        onClick={onDone}
        title="Done"
        shortcut="Esc"
        tooltipSide="top"
      >
        Done
      </Button>
    </FloatingIsland>
  );
}
