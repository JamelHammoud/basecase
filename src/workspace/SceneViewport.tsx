import { drilledOperands } from '../booleans/picking';
import { importedPlacement } from '../cases/importedWorld';
import { caseWorldView } from '../cases/worldView';
import { AgentCursor } from '../components/AgentCursor';
import { AnnotationLayer } from '../components/Annotations';
import { BuildAlongBar } from '../components/build/BuildAlongBar';
import { CameraStrip } from '../components/cameras/CameraStrip';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { Viewport3D } from '../components/Viewport3D';
import { SkeletonServoMenu } from '../components/pose/SkeletonServoMenu';
import { canvasSelection } from './canvasSelection';
import { MarkLabelField } from './MarkLabelField';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface SceneViewportProps {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
}

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

function worldViewFor(core: WorkspaceCore) {
  const { active, builder } = core.simTraining.cases;
  const imported = builder.open && builder.imported;

  return imported ? { ...imported, position: importedPlacement(imported, builder.robot) } : caseWorldView(active);
}

function shownPartsFor(core: WorkspaceCore) {
  const parts = core.studio.showReferenceImages ? core.parts : core.parts.filter((p) => p.kind !== 'image_plane');

  return [...parts, ...drilledOperands(core.parts, core.selectedIds)];
}

function cameraStripFor(core: WorkspaceCore, actions: WorkspaceActions) {
  return (
    <CameraStrip
      imported={worldViewFor(core)}
      parts={core.parts}
      sim={core.simTraining.sim}
      cameras={actions.cameras}
      patchPart={actions.edits.patchPart}
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

  return (
    <>
      <Viewport3D
        ref={viewportRef}
        sceneKey={scene.sceneId}
        parts={shownPartsFor(core)}
        selectedPartIds={canvasSelection(core.caseRun, selectedIds)}
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
        worldParts={sim.guestParts.length ? [...sim.worldParts, ...sim.guestParts] : sim.worldParts}
        importedWorld={worldViewFor(core)}
        onWorldError={core.simTraining.cases.showError}
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
      {!core.caseRun.open && cameraStripFor(core, actions)}
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
