import { LeftSidebar } from '../components/LeftSidebar';
import { LAYOUT, PanelResizer } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { setUpServos } from '../robot/servoSetup';
import { measuredJoints } from '../reality/measuredJoints';
import { unitHistories } from '../reality/projectCalibrations';
import { useFleet } from '../robot/useRobot';
import { calibrateConnectedRobot, rollBackCalibration } from './calibrationActions';
import { canReplayRuns, replayRobotRun } from './robotReplay';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';
import { showPartsSection } from './showView';
import { addRobotComputer } from './robotComputer';
import { bodyRobot, fitBodyFromUi, rollBackBodyCalibration } from './bodyActions';

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
  const showRobots = () => showPartsSection(core, 'Robots');
  const unitCalibrations = unitHistories(core.project, useFleet().selected);
  const body = bodyRobot(core);
  const libraryProps = {
    customModels: studio.customModels,
    onInsertModel: creation.placeCustomModel,
    onRenameModel: library.renameModel,
    onDuplicateModel: library.duplicateModel,
    onDeleteModel: library.deleteModel,
    onSaveModel: library.saveAsModel,
    onImport: () => void files.pickImports(),
    onOpenTries: core.triesView.openFor,
    onOpenHit: core.triesView.openAt,
    datasets: core.triesView.datasets,
    onOpenDataset: core.datasets.open,
    onDeleteDataset: core.datasets.remove,
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
        onShowRobots: showRobots,
        onDescribe: IS_WEB_DEMO ? undefined : () => tool.requestCompose('/case '),
      }}
      routines={{ routines: core.simTraining.routines, onTrain: () => tool.setRightTab('sim') }}
      operate={{
        joints: core.project.joints ?? [],
        parts,
        bodyCalibration:
          body && !IS_WEB_DEMO
            ? {
                robot: body,
                history: core.project.bodyCalibrations?.[body],
                onFit: () => fitBodyFromUi(core),
                onRollBack: () => rollBackBodyCalibration(core.docs.updateProjectNow, body),
              }
            : undefined,
        onShowRobots: showRobots,
        calibration: {
          calibrations: unitCalibrations,
          measured: measuredJoints({
            joints: core.project.joints ?? [],
            parts,
            calibrations: unitCalibrations,
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
        onAddRobotComputer: IS_WEB_DEMO ? undefined : () => addRobotComputer(core),
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
      dataLayers={core.dataLayers}
      onPartContextMenu={onPartContextMenu}
      onAddCatalogItem={creation.addCatalogItem}
      library={libraryProps}
    />
  );
}
