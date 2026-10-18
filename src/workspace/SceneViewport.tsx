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
  const { viewportRef, studio, parts, selectedIds, selection, tool, annotations, posing, simTraining } = core;
  const { edits } = actions;
  const { sim } = simTraining;
  const { run } = agent;
  const { setDraft } = annotations;
  const shownParts = studio.showReferenceImages ? parts : parts.filter((p) => p.kind !== 'image_plane');

  return (
    <>
      <Viewport3D
        ref={viewportRef}
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
        onPlaceAnnotation={annotations.place}
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
      <AgentCursor
        viewportRef={viewportRef}
        target={run.cursorTarget}
        visible={run.isBusy && !!run.cursorTarget}
        action={run.action || run.status}
      />
    </>
  );
}
