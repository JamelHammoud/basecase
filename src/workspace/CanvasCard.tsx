import { ViewportToolbar } from '../components/ViewportToolbar';
import { Toast, PhotoIcon } from '../design-system';
import { MarkBar } from './MarkBar';
import { SceneViewport } from './SceneViewport';
import { SelectionBar } from './SelectionBar';
import type { AgentSession } from './useAgentSession';
import type { CanvasMenu } from './useCanvasMenu';
import type { useCanvasDrop } from './useCanvasDrop';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

interface CanvasCardProps {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  agent: AgentSession;
  pointerHandlers: CanvasMenu['pointerHandlers'];
  drop: ReturnType<typeof useCanvasDrop>;
}

function DropOverlay() {
  return (
    <div className="absolute inset-3 z-40 rounded-3xl border-2 border-dashed border-[#0d99ff]/70 bg-[#0d99ff]/[0.06] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="glass rounded-2xl px-5 py-3 flex items-center gap-2.5 text-[14px] text-white/90">
        <PhotoIcon className="w-5 h-5 text-[#5cb8ff]" />
        Drop to add a reference image
      </div>
    </div>
  );
}

function CanvasBottomBar({ core, actions, ui, showSelectionBar }: CanvasCardProps & { showSelectionBar: boolean }) {
  const { tool, annotations, studio, selection, marks } = core;
  const { ops, edits, creation } = actions;
  const { toggleCommentMode } = annotations;
  const { openCreator } = tool;

  return (
    <div className="absolute bottom-5 inset-x-0 z-20 flex flex-col items-center gap-2 pointer-events-none">
      {tool.marking && <MarkBar marks={marks} onDone={() => tool.toggleMarking(false)} />}
      {showSelectionBar && (
        <SelectionBar
          selectedParts={selection.selectedParts}
          onBoolean={ops.runBoolean}
          onGroup={edits.group}
          onUngroup={edits.ungroup}
        />
      )}
      <div className="pointer-events-auto">
        <ViewportToolbar
          transformMode={tool.transformMode}
          onTransformMode={tool.setMode}
          showSculpt={studio.sculptEnabled}
          commentMode={annotations.commentMode}
          measuring={tool.measuring}
          onMeasure={() => tool.toggleMeasure(true)}
          marking={tool.marking}
          onAnnotate={() => tool.toggleMarking(true)}
          onToggleComment={() => toggleCommentMode()}
          shapesOpen={ui.shapesOpen}
          onShapesOpenChange={ui.setShapesOpen}
          onAddShape={creation.addCatalogItem}
          onSketch={() => openCreator('draw2d')}
          onImportSvg={() => openCreator('svg')}
        />
      </div>
    </div>
  );
}

export function CanvasCard(props: CanvasCardProps) {
  const { active, core, actions, agent, pointerHandlers, drop } = props;
  const { toasts, selection, tool } = core;
  const { creation } = actions;
  const { imageInputRef } = creation;
  const showSelectionBar = selection.selectedParts.length > 1 && tool.transformMode !== 'pose' && !tool.marking;

  return (
    <main
      className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#1b1b1b] rounded-[12px]"
      {...pointerHandlers}
      {...drop.dropHandlers}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          creation.addPickedImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {drop.isDraggingFile && <DropOverlay />}
      <SceneViewport active={active} core={core} actions={actions} agent={agent} />
      <div className="canvas-vignette absolute inset-0 pointer-events-none" />
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-[12px] pointer-events-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      />
      <CanvasBottomBar {...props} showSelectionBar={showSelectionBar} />
      {toasts.toast && (
        <div
          className={`absolute ${showSelectionBar || tool.marking ? 'bottom-[144px]' : 'bottom-[92px]'} inset-x-0 z-30 flex justify-center pointer-events-none transition-[bottom] duration-200`}
        >
          <div className="pointer-events-auto" key={toasts.toast.id}>
            <Toast toast={toasts.toast} onDismiss={toasts.dismissToast} />
          </div>
        </div>
      )}
    </main>
  );
}
