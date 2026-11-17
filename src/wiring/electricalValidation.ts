import { nodeKey } from './electricalGraph';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { POWER_MODULES } from './electricalModules';
import type { ElectricalEndpoint, ElectricalNet, ElectricalProjection, ElectricalRequirement } from './electricalTypes';

function endpointRequirement(end: ElectricalEndpoint, code: string, detail: string): ElectricalRequirement {
  return { code, detail, partIds: end.partId ? [end.partId] : [], references: [end.reference] };
}

function pinMapRequirements(end: ElectricalEndpoint): ElectricalRequirement[] {
  if (end.componentId === null && !end.moduleId && end.map?.basis === 'requirement') return [];

  const componentMap = ELECTRICAL_PIN_MAPS.find(
    (map) => map.componentId === end.componentId && (!map.variant || map.variant === end.variant),
  )?.ports.find((port) => port.port === end.port);
  const original = end.moduleId ? POWER_MODULES.find((module) => module.id === end.moduleId)?.map : componentMap;

  return JSON.stringify(original) === JSON.stringify(end.map)
    ? []
    : [
        endpointRequirement(
          end,
          'pin-map-mismatch',
          `${end.name}: the exported pin map differs from its source record.`,
        ),
      ];
}

function connectionRequirements(
  end: ElectricalEndpoint,
  assigned: Map<string, ElectricalNet>,
): ElectricalRequirement[] {
  return (end.map?.pins ?? []).flatMap((pin): ElectricalRequirement[] => {
    if (end.map?.unused?.[pin.number]) return [];

    const net = assigned.get(nodeKey({ reference: end.reference, pin: pin.number }));

    if (!net && pin.function === 'ground')
      return [endpointRequirement(end, 'missing-ground', `${end.name}: connect ${end.port} ground.`)];

    if (!net)
      return [
        endpointRequirement(end, 'unsupported-connection', `${end.name}: connect ${end.port} pin ${pin.number}.`),
      ];

    if (net.function !== pin.function)
      return [
        endpointRequirement(
          end,
          'polarity-conflict',
          `${end.name}: ${end.port} pin ${pin.number} joins incompatible electrical functions.`,
        ),
      ];

    return [];
  });
}

export function validateElectrical(projection: ElectricalProjection): ElectricalRequirement[] {
  const assigned = new Map(projection.nets.flatMap((net) => net.nodes.map((node) => [nodeKey(node), net])));

  return projection.endpoints
    .filter((end) => end.map)
    .flatMap((end) => [...pinMapRequirements(end), ...connectionRequirements(end, assigned)]);
}
