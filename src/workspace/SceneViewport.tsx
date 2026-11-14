import { drilledOperands } from '../booleans/picking';
import { AgentCursor } from '../components/AgentCursor';
import { AnnotationLayer } from '../components/Annotations';
import { BuildAlongBar } from '../components/build/BuildAlongBar';
import { CameraStrip } from '../components/cameras/CameraStrip';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { Viewport3D } from '../components/Viewport3D';
import { SkeletonServoMenu } from '../components/pose/SkeletonServoMenu';
import { MarkLabelField } from './MarkLabelField';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { Simulation } from '../sim/useSimulation';

const NO_SELECTION: string[] = [];

interface SceneViewportProps {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
}

const worldLayer = (sim: Simulation) => ({
  worldParts: sim.guestParts.length ? [...sim.worldParts, ...sim.guestParts] : sim.worldParts,
  worldLook: sim.worldLook,
});

function markFieldFor(marks: WorkspaceCore['marks']) {
  const editingMark = marks.selected;

  if (!editingMark) return null;

  return (
    <MarkLabelField
      key={editingMark.id}
      label={editingMark.label ?? ''}
      color={marks.color}
      autoFocus={marks.freshId === editingMark.id}
      onCommit={(label) => marks.setLabel(editingMark.id, label)}
      onClose={() => marks.select(null)}
    />
  );
}

export function SceneViewport({ active, core, actions, agent }: SceneViewportProps) {
  const {
    viewportRef,
    scene,
    studio,
    parts,
    project,
    selectedIds,
    selection,
    tool,
    annotations,
    marks,
    measure,
    posing,
    simTraining: { sim },
  } = core;
  const { edits } = actions;
  const { cursors, lanes } = agent;
  const topParts = studio.showReferenceImages ? parts : parts.filter((p) => p.kind !== 'image_plane');
  const shownParts = [...topParts, ...drilledOperands(parts, selectedIds)];

  return (
    <>
      <Viewport3D
        ref={viewportRef}
        sceneKey={scene.sceneId}
        parts={shownParts}
        selectedPartIds={core.caseRun.open ? NO_SELECTION : selectedIds}
        transformMode={tool.transformMode}
        sculptSettings={tool.sculptSettings}
        snapStepMm={studio.snapStepMm}
        snapAngleDeg={studio.snapAngleDeg}
        trackpadMode={studio.trackpadMode}
        showGrid={studio.showGrid}
        onSelectPart={selection.select}
        onPickPoint={core.sketching.notePick}
        onOpenPart={core.sketching.edit}
        onUpdatePartTransform={edits.updatePartTransform}
        onUpdatePartsTransform={edits.updatePartsTransform}
        onPlacePart={edits.placePart}
        onMarqueeSelect={selection.marqueeSelect}
        onCommitSculptMesh={edits.commitSculptMesh}
        annotateMode={annotations.commentMode}
        measureMode={tool.measuring}
        measureUnit={studio.measureUnit}
        measureKind={measure.kind}
        figures={measure.figures}
        humanHeightMm={measure.humanHeightMm}
        onPlaceFigure={measure.placeFigure}
        onPlaceAnnotation={annotations.place}
        markMode={tool.marking}
        marks={project.marks}
        markColor={marks.color}
        markTool={marks.tool}
        selectedMarkId={marks.selected?.id ?? null}
        onAddMark={marks.add}
        onSelectMark={marks.select}
        onEraseMarks={marks.erase}
        onMoveMark={marks.move}
        markField={markFieldFor(marks)}
        agentFrames={agent.frames}
        fixedCameras={project.cameras}
        earth={actions.earth.view}
        checkDots={core.readiness.dots}
        paused={!active || !!core.printing.mode}
        pose={posing.deltas}
        {...worldLayer(sim)}
        poseJoint={tool.transformMode === 'pose' ? posing.poseJoint : null}
        onGrab={sim.status === 'ready' ? sim.grab : null}
        onPoseJoint={posing.onPoseJoint}
        axisPick={
          actions.joints.picking && {
            parts: [actions.joints.picking.parent, actions.joints.picking.child],
            ready: actions.joints.picking.ready,
          }
        }
        onAxisPick={actions.joints.onAxisPick}
        buildStep={core.buildAlong.view}
        skeleton={core.skeleton.view}
        onSkeletonDrag={core.skeleton.onViewportDrag}
        onSkeletonPick={core.skeleton.openMenu}
      />
      <SkeletonServoMenu skeleton={core.skeleton} />
      <DriveOverlay sim={sim} />
      <BuildAlongBar
        buildAlong={core.buildAlong}
        active={active}
        ready={core.printing.readySteps(core.buildAlong.stepParts)}
      />
      {!core.caseRun.open && (
        <CameraStrip parts={parts} sim={sim} cameras={actions.cameras} patchPart={edits.patchPart} />
      )}
      <AnnotationLayer
        annotations={annotations.annotations}
        parts={parts}
        viewportRef={viewportRef}
        activeId={annotations.activeId}
        draft={annotations.draft}
        onOpen={annotations.setActiveId}
        onCancelDraft={() => annotations.setDraft(null)}
        onCreate={annotations.create}
        onReply={annotations.reply}
        onEditComment={annotations.editComment}
        onDeleteComment={annotations.deleteComment}
        onToggleResolved={annotations.toggleResolved}
        onDeleteThread={annotations.deleteThread}
      />
      {cursors.map((c) => (
        <AgentCursor
          key={c.actor}
          viewportRef={viewportRef}
          target={c.target}
          visible={!!c.target}
          name={c.name}
          color={c.color}
          action={c.action || lanes.lanes.find((l) => c.actor === l.id)?.status}
        />
      ))}
    </>
  );
}
