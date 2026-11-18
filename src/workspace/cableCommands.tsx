import { PackageIcon } from '../design-system';
import { editableNets, routeId, routeIdentity } from '../wiring/routeEditing';
import type { CommandInputs } from './sceneCommands';

export function cableCommands({ core }: CommandInputs) {
  return editableNets(core).map((net) => {
    const identity = routeIdentity(net)!;

    return {
      id: `edit-route:${routeId(identity)}`,
      group: 'Scene' as const,
      label: `Edit Route: ${net.from.name}: ${net.from.port!.name} to ${net.to.name}: ${net.to.port!.name}`,
      icon: <PackageIcon />,
      keywords: 'cable reach wire stock anchor point',
      run: () => {
        core.tool.openRightTab('build');
        core.cableRoutes.open(identity);
      },
    };
  });
}
