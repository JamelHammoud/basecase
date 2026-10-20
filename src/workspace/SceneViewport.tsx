import { AgentCursor } from '../components/AgentCursor';
import { AnnotationLayer } from '../components/Annotations';
import { Viewport3D } from '../components/Viewport3D';
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
    posing,
    simTraining,
  } = core;
  const { edits } = actions;
  const { sim } = simTraining;
  const { cursors, lanes } = agent;
  const { setDraft } = annotations;
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
        onMarqueeSelect={selection.marqueeSelect}
        onCommitSculptMesh={edits.commitSculptMesh}
        annotateMode={annotations.commentMode}
        measureMode={tool.measuring}
        measureUnit={studio.measureUnit}
        onPlaceAnnotation={annotations.place}
        markMode={tool.marking}
        marks={project.marks}
        markColor={marks.color}
        selectedMarkId={marks.selected?.id ?? null}
        onAddMark={marks.add}
        onSelectMark={marks.select}
        paused={!active}
        pose={posing.deltas}
        poseJoint={tool.transformMode === 'pose' ? posing.poseJoint : null}
        onGrab={sim.status === 'ready' ? sim.grab : null}
        onPoseJoint={posing.onPoseJoint}
      />
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
          action={c.action || lanes.lanes.find((l) => c.actor === l.id)?.status}
        />
      ))}
    </>
  );
}
