import { Inspector } from '../components/Inspector';
import { SculptAndDrawStudio } from '../components/SculptAndDrawStudio';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface InspectTabProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
}

function ModePanel({ core, actions }: InspectTabProps) {
  const { tool, selection } = core;
  const { creation } = actions;
  const studioMode = tool.studioMode!;

  return (
    <SculptAndDrawStudio
      selectedPart={selection.selectedParts[0] ?? null}
      sculptSettings={tool.sculptSettings}
      mode={studioMode}
      onChangeMode={(m) => m !== 'clay' && tool.setCreator(m)}
      onDone={() => (studioMode === 'clay' ? tool.setMode('translate') : tool.setCreator(null))}
      onUpdateSculptSettings={tool.updateSculptSettings}
      onAddClayPreset={creation.addClayPreset}
      onSubdivideSelectedClay={creation.subdivideSelectedClay}
      onCreateFrom2DDrawing={async (params) => {
        await creation.createFromSketch(params);
        tool.setCreator(null);
      }}
    />
  );
}

function SceneInspector({ core, actions }: InspectTabProps) {
  const { scene, parts, studio, selection, annotations } = core;
  const { edits, ops, library } = actions;
  const { saveAsModel } = library;
  const { toggleCommentMode } = annotations;

  return (
    <Inspector
      part={selection.selectedPart}
      parts={parts}
      globalGoal={scene.globalGoal}
      onChangeGoal={scene.setGlobalGoal}
      snapStepMm={studio.snapStepMm}
      onUpdate={edits.updateSelectedPart}
      onDuplicate={ops.duplicateSelected}
      onSaveAsModel={() => void saveAsModel('selected')}
      onDelete={ops.deleteSelected}
      onDropToFloor={edits.dropToGround}
      onStack={edits.stackOnBelow}
      annotations={annotations.annotations}
      activeAnnotationId={annotations.activeId}
      onOpenAnnotation={annotations.setActiveId}
      onAddComment={() => toggleCommentMode(true)}
      selectedParts={selection.selectedParts}
      onUpdateMany={edits.updateSelectedParts}
      onBoolean={ops.runBoolean}
      onGroup={edits.group}
      onUngroup={edits.ungroup}
      onAlign={edits.align}
      onDistribute={edits.distribute}
      onMoveSelection={edits.moveSelection}
      onRotateSelection={edits.rotateSelection}
      onRenameGroup={edits.renameGroup}
      onChangeHardware={edits.changeHardware}
      onAddClearanceHole={ops.addClearanceHole}
    />
  );
}

export function InspectTab(props: InspectTabProps) {
  return props.core.tool.studioMode ? <ModePanel {...props} /> : <SceneInspector {...props} />;
}
