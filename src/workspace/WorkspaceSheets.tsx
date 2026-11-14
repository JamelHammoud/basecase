import { ArmSizingSheet } from '../components/ArmSizingSheet';
import { GuideViewer } from '../components/build/guideViewer/GuideViewer';
import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { InstallSkillSheet } from '../components/InstallSkillSheet';
import { platformBridge } from '../utils/platformBridge';
import { RetargetSheet } from '../components/RetargetSheet';
import { TeachGestureHost } from './TeachGestureHost';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface WorkspaceSheetsProps {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
}

export function WorkspaceSheets({ active, core, actions }: WorkspaceSheetsProps) {
  const { posing, guide } = core;
  const desktop = platformBridge.isElectron();
  const { robots, pose, arm } = actions;
  const { motionInputRef } = pose;
  const { importRobotFrom } = robots;
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
        />
      )}
      <ImportRobotSheet
        key={robots.robotChoice?.choices.join('\n') ?? 'link'}
        open={robots.importRobotOpen}
        choice={robots.robotChoice}
        onClose={robots.closeImportRobot}
        onImport={(src, at) => void importRobotFrom(src, at)}
      />
      <InstallSkillSheet
        open={active && skillHub.installOpen}
        onClose={skillHub.closeInstall}
        onInstall={skillHub.install}
      />
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
