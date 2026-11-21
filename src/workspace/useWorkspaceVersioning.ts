import type { RobotPoseState } from '../types/robotics';
import { useSceneVersions, type VersionOptions } from './useSceneVersions';

export function useWorkspaceVersioning(
  options: VersionOptions & {
    restorePose: (pose: RobotPoseState | undefined) => void;
    codeOnly: boolean;
  },
) {
  const versions = useSceneVersions(options);
  const { docs, scene, annotations, restorePose, codeOnly } = options;
  const travel = (direction: 'undo' | 'redo') => {
    const restored = docs.travel(
      { direction, codeOnly, scene: { globalGoal: scene.globalGoal, annotations: annotations.annotations } },
      restorePose,
    );

    if (!restored) return;

    scene.setGlobalGoal(restored.globalGoal);
    annotations.reset(restored.annotations);
  };

  return { versions, undo: () => travel('undo'), redo: () => travel('redo') };
}
