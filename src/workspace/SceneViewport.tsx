import { AgentCursor } from '../components/AgentCursor';
import { AnnotationLayer } from '../components/Annotations';
import { CameraStrip } from '../components/cameras/CameraStrip';
import { DriveOverlay } from '../components/simulate/DriveOverlay';
import { Viewport3D } from '../components/Viewport3D';
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
    simTraining,
  } = core;
  const { edits } = actions;
  const { sim } = simTraining;
  const { cursors, lanes } = agent;
  const { setDraft } = annotations;
  const editingMark = marks.selected;
  const shownParts = studio.showReferenceImages ? parts : parts.filter((p) => p.kind !== 'image_plane');

  return (
    <>
      <Viewport3D
        ref={viewportRef}
        sceneKey={scene.sceneId}
        parts={shownParts}
        selectedPartIds={selectedIds}
        transformMode={tool.transformMode}
        sculptSettings={tool.sculptSettings}
        snapStepMm={studio.snapStepMm}
        snapAngleDeg={studio.snapAngleDeg}
        trackpadMode={studio.trackpadMode}
        showGrid={studio.showGrid}
        blueprintDataUrl={null}
        onSelectPart={selection.select}
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
        markField={
          editingMark && (
            <MarkLabelField
              key={editingMark.id}
              label={editingMark.label ?? ''}
              color={marks.color}
              autoFocus={marks.freshId === editingMark.id}
              onCommit={(label) => marks.setLabel(editingMark.id, label)}
              onClose={() => marks.select(null)}
            />
          )
        }
        agentFrames={agent.frames}
        fixedCameras={project.cameras}
        checkDots={core.readiness.dots}
        paused={!active || !!core.printing.mode}
        pose={posing.deltas}
        worldParts={sim.worldParts}
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
      />
      <DriveOverlay sim={sim} />
      <CameraStrip parts={parts} sim={sim} cameras={actions.cameras} patchPart={edits.patchPart} />
      <AnnotationLayer
        annotations={annotations.annotations}
        parts={parts}
        viewportRef={viewportRef}
        activeId={annotations.activeId}
        draft={annotations.draft}
        onOpen={annotations.setActiveId}
        onCancelDraft={() => setDraft(null)}
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
