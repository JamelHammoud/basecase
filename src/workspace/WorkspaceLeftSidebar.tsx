import { LeftSidebar } from '../components/LeftSidebar';
import { LAYOUT, PanelResizer } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { setUpServos } from '../robot/servoSetup';
import { measuredJoints } from '../reality/measuredJoints';
import { calibrateConnectedRobot, rollBackCalibration } from './calibrationActions';
import { canReplayRuns, replayRobotRun } from './robotReplay';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';
import { showPartsSection } from './showView';

interface WorkspaceLeftSidebarProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  onPartContextMenu: (id: string, x: number, y: number) => void;
}

export function WorkspaceLeftSidebar({ core, actions, ui, onPartContextMenu }: WorkspaceLeftSidebarProps) {
  const { studio, tool, parts, selectedIds, selection } = core;
  const { library, creation, edits, robots, files } = actions;
  const { panelWidths } = studio;
  const browseRobots = () => showPartsSection(core, 'Robots');
  const libraryProps = {
    customModels: studio.customModels,
    onInsertModel: creation.placeCustomModel,
    onRenameModel: library.renameModel,
    onDuplicateModel: library.duplicateModel,
    onDeleteModel: library.deleteModel,
    onSaveModel: library.saveAsModel,
    onImport: () => void files.pickImports(),
  };

  return (
    <LeftSidebar
      open={studio.isLeftOpen && !core.caseRun.open}
      inert={core.caseRun.open}
      partsSearchRef={ui.partsSearchRef}
      partsReveal={tool.partsReveal}
      onPartsRevealed={tool.clearPartsReveal}
      onInsertRobot={robots.pickRobot}
      onInsertSimReady={(asset) => robots.importRobotFrom({ kind: 'simready', asset })}
      width={panelWidths.left}
      resizing={studio.resizingPanel === 'left'}
      edge={
        <PanelResizer
          edge="right"
          width={panelWidths.left}
          min={LAYOUT.leftPanelMin}
          max={LAYOUT.leftPanelMax}
          defaultWidth={LAYOUT.leftPanelWidth}
          onResize={ui.resizeLeft}
          onCollapse={ui.collapseLeft}
          onResizingChange={ui.resizingLeft}
        />
      }
      cases={{
        cases: core.simTraining.cases,
        compare: core.caseCompare,
        onOpen: () => tool.setRightTab('sim'),
        onBrowseRobots: browseRobots,
        onDescribe: IS_WEB_DEMO ? undefined : () => tool.requestCompose('/case '),
      }}
      routines={{ routines: core.simTraining.routines, onTrain: () => tool.setRightTab('sim') }}
      operate={{
        joints: core.project.joints ?? [],
        parts,
        onBrowseRobots: browseRobots,
        calibration: {
          calibrations: core.project.servoCalibrations,
          measured: measuredJoints({
            joints: core.project.joints ?? [],
            parts,
            calibrations: core.project.servoCalibrations,
          }),
          onCalibrate: () =>
            void calibrateConnectedRobot(core.docs.updateProjectNow, {
              joints: core.project.joints ?? [],
              parts,
              project: core.project,
            }),
          onCalibrateJoint: (jointId) =>
            void calibrateConnectedRobot(core.docs.updateProjectNow, {
              joints: core.project.joints ?? [],
              parts,
              project: core.project,
              only: [jointId],
            }),
          onRollBack: (jointId) => rollBackCalibration(core.docs.updateProjectNow, jointId),
        },
        onSetUpServos: () =>
          void setUpServos({ joints: core.project.joints ?? [], parts, select: core.setSelectedIds }),
        onReplay: canReplayRuns(core) ? (messageId) => replayRobotRun(core, messageId) : undefined,
      }}
      tab={tool.leftTab}
      onTabChange={tool.setLeftTab}
      parts={parts}
      selectedIds={selectedIds}
      onSelectPart={selection.select}
      onSelectIds={selection.selectIds}
      onRenameGroup={edits.renameGroup}
      showReferenceImages={studio.showReferenceImages}
      onToggleReferenceImages={ui.toggleReferenceImages}
      onTogglePartFlag={edits.togglePartFlag}
      onRenamePart={edits.renamePart}
      renamingLayer={ui.renamingLayer}
      onRenamingLayer={ui.setRenamingLayer}
      onPartContextMenu={onPartContextMenu}
      onAddCatalogItem={creation.addCatalogItem}
      library={libraryProps}
    />
  );
}
