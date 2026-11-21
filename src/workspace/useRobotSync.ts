import { useOperateAlerts } from './useOperateAlerts';
import { unitHistories } from '../reality/projectCalibrations';
import { useRobotMounts } from '../robot/robotMounts';
import { useRobotPolicy } from '../robot/robotPolicy';
import { useFleet } from '../robot/useRobot';
import type { useSceneDocument } from './useSceneDocument';
import type { ShowToast } from './types';
import { useOperateTries } from './useOperateTries';
import type { SimTraining } from './useSimTraining';

interface RobotSyncInput {
  active: boolean;
  sceneId: string;
  docs: ReturnType<typeof useSceneDocument>;
  training: SimTraining;
  showToast: ShowToast;
}

export function useRobotSync({ active, sceneId, docs, training, showToast }: RobotSyncInput) {
  const { selected } = useFleet();
  const { project, parts } = docs;

  useOperateAlerts(project.cases, sceneId);

  useRobotPolicy({
    active,
    policies: project.policies,
    isStale: training.training.isStale,
    skillRows: training.skills.rows,
  });
  useRobotMounts({ active, joints: project.joints ?? [], calibrations: unitHistories(project, selected) });
  useOperateTries({
    active,
    sceneId,
    joints: project.joints ?? [],
    sim: training.sim,
    showToast,
    project,
    parts,
    updateProject: docs.updateProjectNow,
  });
}
