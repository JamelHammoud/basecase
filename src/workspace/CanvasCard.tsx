import { MeasureToolbar } from '../components/MeasureToolbar';
import { PlateBar } from '../components/print/PlateBar';
import { TryTimeline } from '../components/simulate/TryTimeline';
import { TriesMode } from '../components/tries/TriesMode';
import { ViewportToolbar } from '../components/ViewportToolbar';
import { DropOverlay, ErrorBoundary, FileImportIcon, PhotoIcon, Toast } from '../design-system';
import { CaseRunOverlays } from './CaseRunProvider';
import { MarkBar } from './MarkBar';
import { PlateCanvas } from './PlateCanvas';
import { SceneViewport } from './SceneViewport';
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
        onDone={() => tool.toggleMeasure(false)}
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
      onSketch={core.sketching.open}
      onImportSvg={() => openCreator('svg')}
    />
  );
}

function CanvasBottomBar({ core, actions, ui, active }: CanvasCardProps) {
  const { tool, marks, toasts } = core;

  return (
    <div className="absolute bottom-5 inset-x-0 z-20 flex flex-col items-center gap-[8px] pointer-events-none">
      {toasts.toast && (
        <div className="pointer-events-auto" key={toasts.toast.id}>
          <Toast toast={toasts.toast} onDismiss={toasts.dismissToast} />
        </div>
      )}
      {active && !core.printing.mode && (
        <TryTimeline
          timeline={core.simTraining.cases.timeline}
          rig={core.posing.rig}
          onSelectParts={core.setSelectedIds}
        />
      )}
      {tool.marking && !core.printing.mode && <MarkBar marks={marks} onDone={() => tool.toggleMarking(false)} />}
      {!core.caseRun.open && !core.triesView.open && (
        <div className="pointer-events-auto">
          <CanvasToolbar core={core} actions={actions} ui={ui} />
        </div>
      )}
    </div>
  );
}

export function CanvasCard(props: CanvasCardProps) {
  const { active, core, actions, agent, pointerHandlers, drop } = props;
  const { creation } = actions;
  const { imageInputRef } = creation;

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
      {drop.isDraggingFile && (
        <DropOverlay
          icon={drop.imagesOnly ? <PhotoIcon className="w-5 h-5" /> : <FileImportIcon className="w-5 h-5" />}
          label={drop.imagesOnly ? 'Drop to add a reference image' : 'Drop to import'}
        />
      )}
      <ErrorBoundary region="Canvas" className="absolute inset-0 flex-col">
        <SceneViewport active={active} core={core} actions={actions} agent={agent} />
        {core.printing.mode && (
          <PlateCanvas active={active} printing={core.printing} parts={core.printing.fitTest?.parts ?? core.parts} />
        )}
      </ErrorBoundary>
      <div className="canvas-vignette absolute inset-0 pointer-events-none" />
      <CaseRunOverlays />
      {core.triesView.open && (
        <TriesMode
          active={active}
          view={core.triesView}
          timelineOpen={core.simTraining.cases.timeline.open}
          sceneId={core.scene.sceneId}
          scene={{ model: core.simTraining.sim.model, parts: core.parts, world: core.simTraining.sim.worldParts }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-[12px] pointer-events-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      />
      <ErrorBoundary region="Toolbar" className="absolute bottom-5 inset-x-0 z-20">
        <CanvasBottomBar {...props} />
      </ErrorBoundary>
    </main>
  );
}
