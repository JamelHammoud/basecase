import type { RefObject } from 'react';
import { PanelRight, Redo2, Undo2 } from 'lucide-react';
import { ExportMenu } from '../components/ExportMenu';
import { DRAG_REGION, IconButton, NO_DRAG_REGION } from '../design-system';
import type { ExportActions } from './useExportActions';

interface TitleBarActionsProps {
  islandRef: RefObject<HTMLDivElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  exports: ExportActions;
  isRightOpen: boolean;
  onToggleRight: () => void;
}

export function TitleBarActions({
  islandRef,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  exports,
  isRightOpen,
  onToggleRight,
}: TitleBarActionsProps) {
  return (
    <div className="absolute top-0 inset-x-0 h-[44px]" style={DRAG_REGION}>
      <div
        ref={islandRef}
        className="absolute right-[20px] top-[8px] h-[28px] flex items-center gap-2"
        style={NO_DRAG_REGION}
      >
        <div className="flex items-center gap-1">
          <IconButton
            icon={<Undo2 className="w-4 h-4" />}
            title="Undo"
            shortcut="⌘Z"
            onClick={onUndo}
            disabled={!canUndo}
          />
          <IconButton
            icon={<Redo2 className="w-4 h-4" />}
            title="Redo"
            shortcut="⇧⌘Z"
            onClick={onRedo}
            disabled={!canRedo}
          />
        </div>
        <ExportMenu
          canExportStl={exports.canExportStl}
          onExportImage={exports.exportImage}
          onExportStl={exports.exportStl}
          onCopyMarkdown={exports.copyBrief}
        />
        <IconButton
          icon={<PanelRight className="w-4 h-4" />}
          title={isRightOpen ? 'Hide inspector' : 'Show inspector'}
          shortcut="⌘I"
          onClick={onToggleRight}
        />
      </div>
    </div>
  );
}
