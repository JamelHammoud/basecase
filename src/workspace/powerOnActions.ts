import type { PowerOnProps } from '../components/operate/PowerOnSection';
import type { ScenePart } from '../types/robotics';
import { checkConnectedPowerOn, fixConnectedPowerOn } from './calibrationActions';
import type { WorkspaceCore } from './useWorkspaceCore';

export function powerOnProps(core: WorkspaceCore, parts: readonly ScenePart[]): PowerOnProps {
  const input = () => ({ joints: core.project.joints ?? [], parts, project: core.project });

  return {
    onCheck: () => void checkConnectedPowerOn(core.docs.updateProjectNow, input()),
    onFix: () => void fixConnectedPowerOn(core.docs.updateProjectNow, input()),
  };
}
