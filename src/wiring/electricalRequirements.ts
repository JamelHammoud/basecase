import type { ElectricalRequirement } from './electricalTypes';

export function mergeElectricalRequirements(...groups: ElectricalRequirement[][]) {
  return [...new Map(groups.flat().map((requirement) => [JSON.stringify(requirement), requirement])).values()];
}
