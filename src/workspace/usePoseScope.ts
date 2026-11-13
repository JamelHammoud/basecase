import type { Posing } from '../utils/usePosing';
import { usePanelSync, type PanelSyncOptions } from './usePanelSync';
import type { SceneDocument } from './useSceneDocument';
import { useSkeletonEdit } from './useSkeletonEdit';

interface PoseScopeOptions {
  posing: Posing;
  docs: SceneDocument;
  panels: Omit<PanelSyncOptions, 'posable' | 'hasRig'>;
}

export function usePoseScope({ posing, docs, panels }: PoseScopeOptions) {
  const onRobot = posing.hasRig && !!posing.robot;
  const skeleton = useSkeletonEdit(docs);
  const posable = onRobot || skeleton.editing || !!docs.project.skeleton;

  usePanelSync({ ...panels, posable, hasRig: posing.hasRig });

  return { onRobot, skeleton, posable };
}
