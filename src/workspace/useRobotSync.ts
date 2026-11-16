import { useOperateAlerts } from './useOperateAlerts';
import { unitHistories } from '../reality/projectCalibrations';
import { useRobotMounts } from '../robot/robotMounts';
import { useRobotPolicy } from '../robot/robotPolicy';
import { useFleet } from '../robot/useRobot';
import type { ProjectSettings } from '../types/robotics';
import type { ShowToast } from './types';
import { useOperateTries } from './useOperateTries';
import type { SimTraining } from './useSimTraining';

interface RobotSyncInput {
  active: boolean;
  sceneId: string;
  project: ProjectSettings;
  training: SimTraining;
  showToast: ShowToast;
}

export function useRobotSync({ active, sceneId, project, training, showToast }: RobotSyncInput) {
  const { selected } = useFleet();

  useOperateAlerts(project.cases, sceneId);

  useRobotPolicy({
    active,
    policies: project.policies,
    isStale: training.training.isStale,
    skillRows: training.skills.rows,
  });
  useRobotMounts({ active, joints: project.joints ?? [], calibrations: unitHistories(project, selected) });
  useOperateTries({ active, sceneId, joints: project.joints ?? [], sim: training.sim, showToast });
}
