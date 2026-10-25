import { GuideViewer } from '../components/build/guideViewer/GuideViewer';
import { ImportRobotSheet } from '../components/ImportRobotSheet';
import { platformBridge } from '../utils/platformBridge';
import { RetargetSheet } from '../components/RetargetSheet';
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
  const { robots, pose } = actions;
  const { motionInputRef } = pose;
  const { importRobotFrom } = robots;

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
        />
      )}
      <ImportRobotSheet
        open={robots.importRobotOpen}
        onClose={robots.closeImportRobot}
        onImport={(src) => void importRobotFrom(src)}
      />
      <RetargetSheet
        key={pose.motionSource?.name}
        source={pose.motionSource}
        rig={posing.robot?.rig ?? posing.rig}
        pointOf={posing.pointOf}
        onClose={pose.closeMotion}
        onCreate={pose.createAnimation}
      />
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
