import { Inspector } from '../components/Inspector';
import { SculptAndDrawStudio } from '../components/SculptAndDrawStudio';
import type { BoundSketch, SketchOutput } from '../components/studio/SketchPanel';
import { GROUND_PLANE, sketchSolid, type SketchShape } from '../utils/sketch/placement';
import { EMPTY_SKETCH } from '../utils/sketch/types';
import { solidSketchParams } from './partFactories';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface InspectTabProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
}

function boundSketch(core: WorkspaceCore): BoundSketch | null {
  const partId = core.sketching.target?.partId;
  const record = partId ? core.parts.find((p) => p.id === partId)?.sketch : undefined;

  if (!partId || !record) return null;

  return { record, onChange: (patch) => core.sketching.change(partId, patch), undo: core.undo, redo: core.redo };
}

function ModePanel({ core, actions }: InspectTabProps) {
  const { tool, selection, sketching } = core;
  const { creation } = actions;
  const studioMode = tool.studioMode!;
  const target = sketching.target;

  const createSketch = async (shape: SketchShape, output: SketchOutput) => {
    const solid = sketchSolid(target?.plane ?? GROUND_PLANE, shape, { id: `node-sketch-${Date.now()}`, ...output });

    if (!solid) return;

    await creation.createFromSketch(solidSketchParams(solid, output));
    tool.setCreator(null);
  };

  return (
    <SculptAndDrawStudio
      key={target?.key ?? 0}
      sketchStart={target?.start ?? EMPTY_SKETCH}
      boundSketch={boundSketch(core)}
      linkage={{ path: sketching.path, setPath: sketching.setPath, insert: sketching.insertLinkage }}
      onCreateSketch={(shape, output) => void createSketch(shape, output)}
      selectedPart={selection.selectedPart}
      sculptSettings={tool.sculptSettings}
      mode={studioMode}
      svgFile={tool.creatorSvg}
      onChangeMode={(m) => m !== 'clay' && tool.setCreator(m)}
      onDone={tool.leaveStudio}
      onUpdateSculptSettings={tool.updateSculptSettings}
      onAddClayPreset={creation.addClayPreset}
      onSubdivideSelectedClay={creation.subdivideSelectedClay}
      onCreateFrom2DDrawing={(params) => {
        creation.createFromSketch(params);
        tool.setCreator(null);
      }}
    />
  );
}

function SceneInspector({ core, actions }: InspectTabProps) {
  const { scene, parts, studio, selection, annotations } = core;
  const { edits, ops, library, tuning } = actions;
  const { saveAsModel } = library;
  const { toggleCommentMode } = annotations;

  return (
    <Inspector
      key={scene.sceneId}
      part={selection.selectedPart}
      parts={parts}
      globalGoal={scene.globalGoal}
      onChangeGoal={scene.setGlobalGoal}
      snapStepMm={studio.snapStepMm}
      onUpdate={edits.updateSelectedPart}
      onDuplicate={ops.duplicateSelected}
      onMirror={actions.mirror.mirrorSelected}
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
      onTuneDimensions={tuning.tune}
    />
  );
}

export function InspectTab(props: InspectTabProps) {
  return props.core.tool.studioMode ? <ModePanel {...props} /> : <SceneInspector {...props} />;
}
