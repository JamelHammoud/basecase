import { armsOfRig } from '../leader/leaderArm';
import { buildLeader, type Leader } from '../leader/makeLeader';
import { DEFAULT_PROJECT } from '../types/robotics';
import { newSceneId } from '../utils/sceneIds';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useLeader(core: WorkspaceCore) {
  const { posing, parts, studio, scene } = core;
  const arms = armsOfRig(posing.rig, parts);

  const makeLeader = (robot?: string): Leader | null => {
    const want = robot ?? posing.robot?.group.key;
    const arm = arms.find((a) => a.robot.key === want) ?? (robot ? undefined : arms[0]);

    if (!arm) return null;

    const leader = buildLeader(arm, scene.sceneId);

    studio.newScene({
      sceneId: newSceneId(),
      sceneName: leader.name,
      globalGoal: '',
      parts: leader.parts,
      annotations: [],
      project: { ...DEFAULT_PROJECT, joints: leader.joints, leads: leader.leads },
      unsaved: true,
    });

    return leader;
  };

  const armOfPart = (partId: string) => arms.find((a) => a.robot.parts.has(partId))?.robot.key ?? null;

  return { leaderArms: arms, makeLeader, armOfPart };
}
