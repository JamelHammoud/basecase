import { memo } from 'react';
import { CanvasCard } from './workspace/CanvasCard';
import { CanvasContextMenu } from './workspace/CanvasContextMenu';
import { CaseRunAreas, CaseRunProvider } from './workspace/CaseRunProvider';
import { RightPanel } from './workspace/RightPanel';
import { TitleBarActions } from './workspace/TitleBarActions';
import type { SceneWorkspaceProps } from './workspace/types';
import { useWorkspace } from './workspace/useWorkspace';
import { ViewRail } from './workspace/ViewRail';
import { WorkspaceLeftSidebar } from './workspace/WorkspaceLeftSidebar';
import { WorkspacePalette } from './workspace/WorkspacePalette';
import { WorkspaceSheets } from './workspace/WorkspaceSheets';

export type { Preferences, StudioShared, WorkspaceHandle, WorkspaceMeta, WorkspaceSeed } from './workspace/types';

function SceneWorkspaceImpl(props: SceneWorkspaceProps) {
  const { core, actions, ui, clipboard, agent, canvasMenu, drop, rightIslandRef } = useWorkspace(props);
  const { studio, docs, tool } = core;
  const { openSettings } = studio;
  const { openMenu } = canvasMenu;
  const { setPaletteOpen } = ui;
  const inputs = { core, actions, ui };

  return (
    <div className="absolute inset-0 overflow-hidden text-white/90 select-none">
      <TitleBarActions
        islandRef={rightIslandRef}
        canUndo={docs.canUndo}
        canRedo={docs.canRedo}
        onUndo={core.undo}
        onRedo={core.redo}
        exports={actions.exports}
        isRightOpen={studio.isRightOpen}
        onToggleRight={ui.toggleRight}
      />
      <ViewRail
        isLeftOpen={studio.isLeftOpen && !core.caseRun.open}
        leftTab={tool.leftTab}
        playTab={tool.playTab}
        onPickView={ui.pickLeftView}
        onOpenSettings={() => openSettings()}
      />
      <div className="absolute top-[44px] left-[52px] right-[8px] bottom-[8px] flex">
        <CaseRunProvider active={props.active} core={core} actions={actions}>
          <WorkspaceLeftSidebar
            core={core}
            actions={actions}
            ui={ui}
            onPartContextMenu={(id, x, y) => openMenu(x, y, id, null)}
          />
          <CaseRunAreas side="before" />
          <CanvasCard
            active={props.active}
            core={core}
            actions={actions}
            ui={ui}
            agent={agent}
            pointerHandlers={canvasMenu.pointerHandlers}
            drop={drop}
          />
          <RightPanel core={core} actions={actions} ui={ui} agent={agent} />
          <CaseRunAreas side="after" />
        </CaseRunProvider>
        <CanvasContextMenu menu={canvasMenu.menu} inputs={inputs} onClose={canvasMenu.closeMenu} />
      </div>
      <WorkspacePalette open={ui.paletteOpen} inputs={{ ...inputs, clipboard }} onClose={() => setPaletteOpen(false)} />
      <WorkspaceSheets active={props.active} core={core} actions={actions} />
    </div>
  );
}

export const SceneWorkspace = memo(
  SceneWorkspaceImpl,
  (prev, next) => !prev.active && !next.active && prev.workspaceId === next.workspaceId && prev.seed === next.seed,
);
