import {
  Button,
  FloatingIsland,
  IconButton,
  IslandDivider,
  GroupIcon,
  IntersectIcon,
  SubtractIcon,
  UngroupIcon,
  UnionIcon,
} from '../design-system';
import type { ScenePart } from '../types/robotics';
import type { BooleanOp } from './useSelectionOps';

interface SelectionBarProps {
  selectedParts: ScenePart[];
  onBoolean: (op: BooleanOp) => void;
  onGroup: () => void;
  onUngroup: () => void;
}

export function SelectionBar({ selectedParts, onBoolean, onGroup, onUngroup }: SelectionBarProps) {
  return (
    <FloatingIsland className="pointer-events-auto h-10 pl-3.5 pr-1 gap-1 rounded-full animate-pop-up">
      <span className="text-[13px] font-medium text-white/85 tabular pr-1.5 whitespace-nowrap">
        {selectedParts.length} selected
      </span>
      <IslandDivider />
      <Button
        size="sm"
        variant="ghost"
        icon={<UnionIcon className="w-4 h-4" />}
        onClick={() => onBoolean('union')}
        title="Merge into one solid"
        tooltipSide="top"
      >
        Union
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<SubtractIcon className="w-4 h-4" />}
        onClick={() => onBoolean('subtract')}
        title={`Cut the others out of ${selectedParts[0].name}`}
        tooltipSide="top"
      >
        Subtract
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<IntersectIcon className="w-4 h-4" />}
        onClick={() => onBoolean('intersect')}
        title="Keep only the shared volume"
        tooltipSide="top"
      >
        Intersect
      </Button>
      <IslandDivider />
      {selectedParts.some((p) => p.group) ? (
        <IconButton
          icon={<UngroupIcon className="w-4 h-4" />}
          title="Ungroup"
          shortcut="⇧⌘G"
          tooltipSide="top"
          className="rounded-full"
          onClick={onUngroup}
        />
      ) : (
        <IconButton
          icon={<GroupIcon className="w-4 h-4" />}
          title="Group"
          shortcut="⌘G"
          tooltipSide="top"
          className="rounded-full"
          onClick={onGroup}
        />
      )}
    </FloatingIsland>
  );
}
