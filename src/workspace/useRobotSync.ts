import { useRobotMounts } from '../robot/robotMounts';
import { useRobotPolicy } from '../robot/robotPolicy';
import type { ProjectSettings } from '../types/robotics';
import type { SimTraining } from './useSimTraining';

interface RobotSyncInput {
  active: boolean;
  project: ProjectSettings;
  training: SimTraining;
}

export function useRobotSync({ active, project, training }: RobotSyncInput) {
  useRobotPolicy({
    active,
    policies: project.policies,
    isStale: training.training.isStale,
    skillRows: training.skills.rows,
  });
  useRobotMounts({ active, joints: project.joints ?? [], calibrations: project.servoCalibrations });
}
