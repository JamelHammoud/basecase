import type { RefObject } from 'react';
import { ExportMenu } from '../components/ExportMenu';
import { DRAG_REGION, IconButton, NO_DRAG_REGION, PanelRightIcon, RedoIcon, UndoIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { useCaptionInset } from '../utils/useCaptionInset';
import type { ExportActions } from './useExportActions';
import { keyFor } from '../app/shortcuts';

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
  const captionInset = useCaptionInset();

  return (
    <div className="absolute top-0 inset-x-0 h-[44px]" style={DRAG_REGION}>
      <div
        ref={islandRef}
        className="absolute top-[8px] h-[28px] flex items-center gap-2"
        style={{ ...NO_DRAG_REGION, right: 20 + captionInset }}
      >
        <div className="flex items-center gap-1 mr-[4px]">
          <IconButton
            icon={<UndoIcon className="w-[18px] h-[18px]" />}
            title="Undo"
            shortcut={keyFor('undo')}
            onClick={onUndo}
            disabled={!canUndo}
          />
          <IconButton
            icon={<RedoIcon className="w-[18px] h-[18px]" />}
            title="Redo"
            shortcut={keyFor('redo')}
            onClick={onRedo}
            disabled={!canRedo}
          />
        </div>
        <ExportMenu
          canExportParts={exports.canExportParts}
          canExportStep={exports.canExportStep}
          canExportRobot={exports.canExportRobot}
          canExportCutFiles={exports.canExportCutFiles}
          onExportImage={exports.exportImage}
          onExportStl={exports.exportStl}
          onExport3mf={() => void exports.export3mf()}
          onExportCutFiles={() => void exports.exportCutFiles()}
          onExportStep={IS_WEB_DEMO ? undefined : () => void exports.exportStep()}
          onExportScene={() => void exports.exportScene()}
          onExportRobot={() => void exports.exportRobotPackage()}
          onAirDrop={() => void exports.airDrop()}
          onCopyMarkdown={exports.copyBrief}
        />
        <IconButton
          icon={<PanelRightIcon className="w-[18px] h-[18px]" />}
          title={isRightOpen ? 'Hide inspector' : 'Show inspector'}
          shortcut={keyFor('toggle-inspector')}
          onClick={onToggleRight}
        />
      </div>
    </div>
  );
}
