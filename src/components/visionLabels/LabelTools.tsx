import React from 'react';
import { IconButton } from '../../design-system/IconButton';
import {
  RectangleIcon,
  PenIcon,
  CoincidentIcon,
  SelectAllIcon,
  BrushIcon,
  UndoIcon,
  RedoIcon,
} from '../../design-system/glyphs';
import type { LabelEditor } from './useLabelEditor';
import type { LabelTool } from './labelKeys';

const tools: { tool: LabelTool; title: string; shortcut: string; icon: React.ReactNode }[] = [
  { tool: 'select', title: 'Select label', shortcut: 'V', icon: <SelectAllIcon /> },
  { tool: 'box', title: 'Draw box', shortcut: 'B', icon: <RectangleIcon /> },
  { tool: 'polygon', title: 'Draw polygon', shortcut: 'P', icon: <PenIcon /> },
  { tool: 'keypoint', title: 'Place keypoint', shortcut: 'K', icon: <CoincidentIcon /> },
  { tool: 'segment', title: 'Segment object', shortcut: 'S', icon: <BrushIcon /> },
];

interface Props {
  editor: LabelEditor;
  segmentation: boolean;
  onToolChange: (tool: LabelTool) => void;
}

export default function LabelTools({ editor, segmentation, onToolChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      {tools
        .filter((entry) => entry.tool !== 'segment' || segmentation)
        .map((entry) => (
          <IconButton
            key={entry.tool}
            title={entry.title}
            shortcut={entry.shortcut}
            icon={<span className="w-4 h-4">{entry.icon}</span>}
            isActive={entry.tool === editor.tool}
            disabled={editor.busy || (entry.tool !== 'select' && !editor.category)}
            onClick={() => onToolChange(entry.tool)}
          />
        ))}
      <span className="w-3" />
      <IconButton
        title="Undo label edit"
        shortcut="⌘Z"
        icon={<UndoIcon className="w-4 h-4" />}
        disabled={!editor.canUndo || editor.busy}
        onClick={editor.undo}
      />
      <IconButton
        title="Redo label edit"
        shortcut="⇧⌘Z"
        icon={<RedoIcon className="w-4 h-4" />}
        disabled={!editor.canRedo || editor.busy}
        onClick={editor.redo}
      />
    </div>
  );
}
