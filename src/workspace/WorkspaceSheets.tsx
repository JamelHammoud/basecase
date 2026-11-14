import { ArmSizingSheet } from '../components/ArmSizingSheet';
import { GuideViewer } from '../components/build/guideViewer/GuideViewer';
import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { InstallSkillSheet } from '../components/InstallSkillSheet';
import { MatchJointsSheet } from '../components/MatchJointsSheet';
import { PlaceOnMapSheet } from '../components/PlaceOnMapSheet';
import { platformBridge } from '../utils/platformBridge';
import { RetargetSheet } from '../components/RetargetSheet';
import { TeachGestureHost } from './TeachGestureHost';
import type { DataImport } from './useDataImport';
import type { EarthPlace } from './useEarthPlace';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface WorkspaceSheetsProps {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
}

function PlaceOnMapHost({ active, earth }: { active: boolean; earth: EarthPlace }) {
  if (!active || !earth.sheetOpen) return null;

  return <PlaceOnMapSheet origin={earth.origin} onClose={earth.close} onPlace={earth.place} />;
}

function MatchJointsHost({ active, data }: { active: boolean; data: DataImport }) {
  if (!active || !data.sheet) return null;

  return <MatchJointsSheet key={data.sheet.source} sheet={data.sheet} onDone={data.settle} />;
}

export function WorkspaceSheets({ active, core, actions }: WorkspaceSheetsProps) {
  const { posing, guide } = core;
  const desktop = platformBridge.isElectron();
  const { robots, pose, arm, data } = actions;
  const { motionInputRef } = pose;
  const { skillHub } = core.simTraining;

  return (
    <>
      {active && guide.viewing && (
        <GuideViewer
          key={guide.viewing.key}
          pages={guide.viewing}
          title={core.scene.sceneName}
          onClosed={guide.closeViewer}
          onReveal={desktop ? () => void guide.reveal() : undefined}
          onOpenPdf={desktop ? () => void guide.openPdf() : undefined}
          onBuildAlong={() => void core.buildAlong.open()}
          ready={core.printing.readySteps(guide.record?.stepParts?.ids ?? [])}
        />
      )}
      <ImportRobotSheet
        key={robots.robotChoice?.choices.join('\n') ?? 'link'}
        open={robots.importRobotOpen}
        choice={robots.robotChoice}
        onClose={robots.closeImportRobot}
        onImport={(src, at) => void data.importOrRobot(src, at)}
      />
      <MatchJointsHost active={active} data={data} />
      <InstallSkillSheet
        open={active && skillHub.installOpen}
        onClose={skillHub.closeInstall}
        onInstall={skillHub.install}
      />
      <PlaceOnMapHost active={active} earth={actions.earth} />
      {arm.targets && (
        <ArmSizingSheet
          targets={arm.targets}
          busy={arm.busy}
          problem={arm.problem}
          onClose={arm.close}
          onSize={arm.size}
        />
      )}
      {pose.motion && (
        <RetargetSheet
          motion={pose.motion}
          rig={posing.robot?.rig ?? posing.rig}
          pointOf={posing.pointOf}
          onClose={pose.closeMotion}
          onCreate={pose.createAnimation}
        />
      )}
      <TeachGestureHost active={active} cases={core.simTraining.cases} project={core.project} />
      <input
        ref={motionInputRef}
        type="file"
        accept=".bvh"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];

          e.target.value = '';
          void pose.readMotionFile(file);
        }}
      />
    </>
  );
}
