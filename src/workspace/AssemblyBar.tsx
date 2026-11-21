import { BuildAlongBar } from '../components/build/BuildAlongBar';
import type { WorkspaceCore } from './useWorkspaceCore';

export function AssemblyBar({ core, active }: { core: WorkspaceCore; active: boolean }) {
  return (
    <BuildAlongBar
      cradle={core.cradle}
      buildAlong={core.buildAlong}
      active={active && !core.printing.mode && !core.buildAlong.frozen}
      ready={core.printing.readySteps(core.buildAlong.stepParts)}
      onPrint={core.printing.openRepairPlate}
    />
  );
}
