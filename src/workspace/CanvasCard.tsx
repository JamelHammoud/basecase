import { MeasureToolbar } from '../components/MeasureToolbar';
import { PlateBar } from '../components/print/PlateBar';
import { ViewportToolbar } from '../components/ViewportToolbar';
import { Toast, PhotoIcon } from '../design-system';
import { MarkBar } from './MarkBar';
import { PlateCanvas } from './PlateCanvas';
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

function CanvasToolbar({ core, actions, ui }: Pick<CanvasCardProps, 'core' | 'actions' | 'ui'>) {
  const { tool, annotations, studio, measure, printing } = core;
  const { creation } = actions;
  const { toggleCommentMode } = annotations;
  const { openCreator } = tool;

  if (printing.mode) return <PlateBar printing={printing} plates={printing.report?.plan.plates ?? []} />;

  if (tool.measuring)
    return (
      <MeasureToolbar
        kind={measure.kind}
        onKind={measure.setKind}
        figures={measure.figures}
        humanHeightMm={measure.humanHeightMm}
        onHumanHeight={measure.setHumanHeightMm}
        unit={studio.measureUnit}
        onExit={() => tool.toggleMeasure(false)}
      />
    );

  return (
    <ViewportToolbar
      transformMode={tool.transformMode}
      onTransformMode={tool.setMode}
      showSculpt={studio.sculptEnabled}
      commentMode={annotations.commentMode}
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
  );
}

function CanvasBottomBar({ core, actions, ui, showSelectionBar }: CanvasCardProps & { showSelectionBar: boolean }) {
  const { tool, selection, marks, toasts } = core;
  const { ops, edits } = actions;

  return (
    <div className="absolute bottom-5 inset-x-0 z-20 flex flex-col items-center gap-[8px] pointer-events-none">
      {toasts.toast && (
        <div className="pointer-events-auto" key={toasts.toast.id}>
          <Toast toast={toasts.toast} onDismiss={toasts.dismissToast} />
        </div>
      )}
      {tool.marking && !core.printing.mode && <MarkBar marks={marks} onDone={() => tool.toggleMarking(false)} />}
      {showSelectionBar && !core.printing.mode && (
        <SelectionBar
          selectedParts={selection.selectedParts}
          onBoolean={ops.runBoolean}
          onGroup={edits.group}
          onUngroup={edits.ungroup}
        />
      )}
      <div className="pointer-events-auto">
        <CanvasToolbar core={core} actions={actions} ui={ui} />
      </div>
    </div>
  );
}

export function CanvasCard(props: CanvasCardProps) {
  const { active, core, actions, agent, pointerHandlers, drop } = props;
  const { selection, tool } = core;
  const { creation } = actions;
  const { imageInputRef } = creation;
  const showSelectionBar =
    selection.selectedParts.length > 1 && tool.transformMode !== 'pose' && !tool.marking && !tool.measuring;

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
      {core.printing.mode && <PlateCanvas active={active} printing={core.printing} parts={core.parts} />}
      <div className="canvas-vignette absolute inset-0 pointer-events-none" />
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-[12px] pointer-events-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      />
      <CanvasBottomBar {...props} showSelectionBar={showSelectionBar} />
    </main>
  );
}
