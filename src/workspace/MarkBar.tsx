import type React from 'react';
import {
  Button,
  FloatingIsland,
  IconButton,
  IslandDivider,
  DeleteIcon,
  EraserIcon,
  MarkerIcon,
} from '../design-system';
import type { MarkTool } from '../three/viewport/types';
import { MarkColors } from './MarkColors';
import type { Marks } from './useMarks';

interface MarkBarProps {
  marks: Marks;
  onDone: () => void;
}

const TOOLS: Array<{ tool: MarkTool; label: string; shortcut: string; icon: React.ReactNode }> = [
  { tool: 'marker', label: 'Marker', shortcut: 'P', icon: <MarkerIcon className="w-4 h-4" /> },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E', icon: <EraserIcon className="w-4 h-4" /> },
];

function MarkTools({ marks }: { marks: Marks }) {
  return (
    <>
      {TOOLS.map((t) => (
        <IconButton
          key={t.tool}
          icon={t.icon}
          title={t.label}
          shortcut={t.shortcut}
          tooltipSide="top"
          className="rounded-full"
          isActive={marks.tool === t.tool}
          onClick={() => marks.setTool(t.tool)}
        />
      ))}
    </>
  );
}

function MarkActions({ marks }: { marks: Marks }) {
  const { selected } = marks;

  if (selected) {
    return (
      <IconButton
        icon={<DeleteIcon className="w-4 h-4" />}
        title="Delete mark"
        shortcut="⌫"
        tooltipSide="top"
        className="rounded-full"
        onClick={() => marks.remove(selected.id)}
      />
    );
  }

  return (
    <IconButton
      icon={<DeleteIcon className="w-4 h-4" />}
      title="Clear marks"
      tooltipSide="top"
      className="rounded-full"
      onClick={marks.clear}
    />
  );
}

export function MarkBar({ marks, onDone }: MarkBarProps) {
  return (
    <FloatingIsland className="pointer-events-auto h-10 pl-1 pr-1 gap-1 rounded-full animate-pop-up">
      <MarkTools marks={marks} />
      {marks.tool === 'marker' && (
        <>
          <IslandDivider />
          <MarkColors value={marks.color} onChange={marks.setColor} />
        </>
      )}
      {marks.marks.length > 0 && (
        <>
          <IslandDivider />
          <MarkActions marks={marks} />
        </>
      )}
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
