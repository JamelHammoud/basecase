import { useEffect } from 'react';
import { useRobotMounts } from '../robot/robotMounts';
import { useRobotPolicy } from '../robot/robotPolicy';
import { setTakeScene } from '../robot/robotStore';
import type { ProjectSettings } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { SimTraining } from './useSimTraining';

interface RobotSyncInput {
  active: boolean;
  project: ProjectSettings;
  training: SimTraining;
  sceneId: string;
  rig: Rig;
}

export function useRobotSync({ active, project, training, sceneId, rig }: RobotSyncInput) {
  const robot = rig.robots[0]?.name ?? 'Robot';

  useRobotPolicy({
    active,
    policies: project.policies,
    isStale: training.training.isStale,
    skillRows: training.skills.rows,
  });
  useRobotMounts({ active, joints: project.joints ?? [], calibrations: project.servoCalibrations });

  useEffect(() => {
    if (active) setTakeScene({ sceneId, robot });
  }, [active, sceneId, robot]);
}
