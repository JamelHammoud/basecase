import { TrainingImagesSheet } from '../components/cases/TrainingImagesSheet';
import { LightenSheet } from '../components/LightenSheet';
import { ArmSizingSheet } from '../components/ArmSizingSheet';
import { MotionDesignSheet } from '../components/MotionDesignSheet';
import { GuideViewer } from '../components/build/guideViewer/GuideViewer';
import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { InstallSkillSheet } from '../components/InstallSkillSheet';
import { MatchJointsSheet } from '../components/MatchJointsSheet';
import { PlaceOnMapSheet } from '../components/PlaceOnMapSheet';
import { platformBridge } from '../utils/platformBridge';
import { RetargetSheet } from '../components/RetargetSheet';
import { ErrorBoundary } from '../design-system';
import { TeachGestureHost } from './TeachGestureHost';
import type { DataImport } from './useDataImport';
import type { EarthPlace } from './useEarthPlace';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { TrainingImages } from './useTrainingImages';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { PoseActions } from './usePoseActions';

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

function TrainingImagesHost({ active, images }: { active: boolean; images: TrainingImages }) {
  if (!active || !images.open) return null;

  return (
    <ErrorBoundary region="Training images" onClose={images.close}>
      <TrainingImagesSheet images={images} />
    </ErrorBoundary>
  );
}

function MotionDesignHost({ active, pose }: { active: boolean; pose: PoseActions }) {
  const { design } = pose;

  if (!design.source) return null;

  return (
    <ErrorBoundary key={design.source.name} region="Design From Motion" onClose={design.close}>
      <MotionDesignSheet
        open={active}
        busy={design.busy}
        problem={design.problem}
        onClose={design.close}
        onDesign={design.design}
      />
    </ErrorBoundary>
  );
}

function LightenHost({ active, actions }: Pick<WorkspaceSheetsProps, 'active' | 'actions'>) {
  const { lighten } = actions;

  if (!active || !lighten.partId) return null;

  return (
    <ErrorBoundary region="Lighten" onClose={lighten.close}>
      <LightenSheet busy={lighten.busy} problem={lighten.problem} onClose={lighten.close} onLighten={lighten.run} />
    </ErrorBoundary>
  );
}

export function WorkspaceSheets({ active, core, actions }: WorkspaceSheetsProps) {
  const { posing, guide } = core;
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
      <LightenHost active={active} actions={actions} />
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
      {pose.motion && (
        <ErrorBoundary key={pose.motion.name} region={`Import ${pose.motion.name}`} onClose={pose.closeMotion}>
          <RetargetSheet
            motion={pose.motion}
            rig={posing.robot?.rig ?? posing.rig}
            pointOf={posing.pointOf}
            onClose={pose.closeMotion}
            onCreate={pose.createAnimation}
          />
        </ErrorBoundary>
      )}
      <MotionDesignHost active={active} pose={pose} />
      <TrainingImagesHost active={active} images={core.simTraining.cases.images} />
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
