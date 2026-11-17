import { actuatorOf, COMPONENT_BY_ID, type ComponentInfo } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { ElectricalInput } from './electricalTypes';

function identity(component: ComponentInfo | undefined) {
  return {
    name: component?.name ?? null,
    group: component?.group ?? null,
    mpn: component?.mpn ?? null,
    sources: component?.links ?? null,
  };
}

export function electricalFacts(input: ElectricalInput) {
  const components = new Map(
    input.parts
      .filter((part) => part.componentId)
      .map((part) => [JSON.stringify([part.componentId, part.componentVariant]), part]),
  );
  const supplyIds = [
    ...new Set([
      ...input.parts.flatMap((part) => (part.supplyId ? [part.supplyId] : [])),
      ...(input.project.extras ?? []).flatMap((extra) => (extra.key.startsWith('supply:') ? [extra.key.slice(7)] : [])),
    ]),
  ].sort();

  return {
    components: [...components]
      .sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
      .map(([, part]) => {
        const component = COMPONENT_BY_ID[part.componentId!];

        return {
          componentId: part.componentId,
          variant: part.componentVariant ?? null,
          ...identity(component),
          actuator: actuatorOf(part.componentId!, part.componentVariant) ?? null,
          battery: component?.battery ?? null,
          regulator: component?.regulator ?? null,
          holder: component?.holder ?? null,
        };
      }),
    supplies: supplyIds.map((id) => {
      const supply = SUPPLY_BY_ID[id];

      return {
        id,
        name: supply?.battery ? supply.name : null,
        battery: supply?.battery ?? null,
        connector: supply?.connector ?? null,
      };
    }),
  };
}
