import { ArmSizingSheet } from '../components/ArmSizingSheet';
import { GuideViewer } from '../components/build/guideViewer/GuideViewer';
import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { InstallSkillSheet } from '../components/InstallSkillSheet';
import { MatchJointsSheet } from '../components/MatchJointsSheet';
import { MotionDesignSheet } from '../components/MotionDesignSheet';
import { PlaceOnMapSheet } from '../components/PlaceOnMapSheet';
import { platformBridge } from '../utils/platformBridge';
import { RetargetSheet } from '../components/RetargetSheet';
import { ErrorBoundary } from '../design-system';
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

  return (
    <ErrorBoundary region="Place on Map" onClose={earth.close}>
      <PlaceOnMapSheet origin={earth.origin} onClose={earth.close} onPlace={earth.place} />
    </ErrorBoundary>
  );
}

function MatchJointsHost({ active, data }: { active: boolean; data: DataImport }) {
  if (!active || !data.sheet) return null;

  return (
    <ErrorBoundary key={data.sheet.source} region="Match Joints" onClose={() => data.settle(null)}>
      <MatchJointsSheet sheet={data.sheet} onDone={data.settle} />
    </ErrorBoundary>
  );
}

function MotionSheet({ core, actions }: Omit<WorkspaceSheetsProps, 'active'>) {
  const { pose, motion } = actions;
  const { posing } = core;

  if (!pose.motion) return null;

  if (pose.designing)
    return (
      <MotionDesignSheet
        name={pose.motion.name}
        seconds={pose.motion.duration}
        busy={motion.busy}
        problem={motion.problem}
        onClose={motion.close}
        onDesign={motion.design}
      />
    );

  return (
    <RetargetSheet
      motion={pose.motion}
      rig={posing.robot?.rig ?? posing.rig}
      pointOf={posing.pointOf}
      onClose={pose.closeMotion}
      onCreate={pose.createAnimation}
    />
  );
}

function MotionSheets({ core, actions }: Omit<WorkspaceSheetsProps, 'active'>) {
  const { pose, motion } = actions;

  if (!pose.motion) return null;

  return (
    <ErrorBoundary
      key={pose.motion.name}
      region={`Import ${pose.motion.name}`}
      onClose={pose.designing ? motion.close : pose.closeMotion}
    >
      <MotionSheet core={core} actions={actions} />
    </ErrorBoundary>
  );
}

export function WorkspaceSheets({ active, core, actions }: WorkspaceSheetsProps) {
  const { guide } = core;
  const desktop = platformBridge.isElectron();
  const { robots, pose, arm, data } = actions;
  const { motionInputRef } = pose;
  const { skillHub } = core.simTraining;
  const installing = active && skillHub.installOpen;

  return (
    <>
      {active && guide.viewing && (
        <ErrorBoundary key={guide.viewing.key} region="Build guide" onClose={guide.closeViewer}>
          <GuideViewer
            pages={guide.viewing}
            title={core.scene.sceneName}
            onClosed={guide.closeViewer}
            onReveal={desktop ? () => void guide.reveal() : undefined}
            onOpenPdf={desktop ? () => void guide.openPdf() : undefined}
            onBuildAlong={() => void core.buildAlong.open()}
            ready={core.printing.readySteps(guide.record?.stepParts?.ids ?? [])}
          />
        </ErrorBoundary>
      )}
      <ErrorBoundary region="Import Robot" resetKey={robots.importRobotOpen} onClose={robots.closeImportRobot}>
        <ImportRobotSheet
          key={robots.robotChoice?.choices.join('\n') ?? 'link'}
          open={robots.importRobotOpen}
          choice={robots.robotChoice}
          onClose={robots.closeImportRobot}
          onImport={(src, at) => void data.importOrRobot(src, at)}
        />
      </ErrorBoundary>
      <MatchJointsHost active={active} data={data} />
      <ErrorBoundary region="Install Skill" resetKey={installing} onClose={skillHub.closeInstall}>
        <InstallSkillSheet open={installing} onClose={skillHub.closeInstall} onInstall={skillHub.install} />
      </ErrorBoundary>
      <PlaceOnMapHost active={active} earth={actions.earth} />
      {arm.targets && (
        <ErrorBoundary region="Size Arm to Targets" onClose={arm.close}>
          <ArmSizingSheet
            targets={arm.targets}
            busy={arm.busy}
            problem={arm.problem}
            onClose={arm.close}
            onSize={arm.size}
          />
        </ErrorBoundary>
      )}
      <MotionSheets core={core} actions={actions} />
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
