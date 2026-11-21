import { componentPorts } from '../data/componentPorts';
import { COMPONENT_BY_ID } from '../data/components';
import type { ScenePart } from '../types/robotics';
import type { NetEnd } from './connectors';
import { compareElectricalIds } from './electricalSource';
import { isElectricalPart } from './electricalSnapshot';
import type { ElectricalEndpoint, ElectricalInput, ElectricalPartMap, ElectricalRequirement } from './electricalTypes';

export function partPinMap(part: ScenePart, maps: readonly ElectricalPartMap[]) {
  return maps.find(
    (map) => map.componentId === part.componentId && (!map.variant || map.variant === part.componentVariant),
  );
}

export function endpointIndex(endpoints: ElectricalEndpoint[]) {
  const indexed = new Map(endpoints.map((end) => [JSON.stringify([end.partId, end.port]), end]));

  return (end: NetEnd) => indexed.get(JSON.stringify([end.id, end.port?.name ?? end.name]));
}

function mappedPorts(part: ScenePart) {
  const connectors = componentPorts(part.componentId).filter((port) => port.kind === 'connector');

  return connectors.length ? connectors.map((port) => port.name) : ['unmapped'];
}

function verifiedMap(known: ElectricalPartMap['ports'][number] | undefined) {
  return known?.source.startsWith('https://') && known.sourceLocator && known.pins.length;
}

function hasIdentity(input: ElectricalInput, id: string | undefined) {
  return !!COMPONENT_BY_ID[id ?? ''] || !!input.project.sourced?.some((item) => item.id === id);
}

export function electricalEndpoints(input: ElectricalInput, maps: readonly ElectricalPartMap[]) {
  const requirements: ElectricalRequirement[] = [];
  const endpoints: ElectricalEndpoint[] = [];
  const parts = input.parts
    .filter(isElectricalPart)
    .slice()
    .sort((a, b) => compareElectricalIds(a.id, b.id));

  for (const part of parts) {
    const start = endpoints.length;
    const map = partPinMap(part, maps);
    const ports = mappedPorts(part);

    for (const port of ports) {
      const known = map?.ports.find((entry) => entry.port === port);
      const verified = verifiedMap(known);
      const endpoint: ElectricalEndpoint = {
        reference: `J${endpoints.length + 1}`,
        partId: part.id,
        componentId: part.componentId ?? null,
        variant: part.componentVariant ?? null,
        name: part.name,
        port,
        map: verified && known ? structuredClone(known) : null,
      };

      endpoints.push(endpoint);

      if (verified) continue;

      requirements.push({
        code: known ? 'missing-pin-source' : 'unknown-pin-map',
        partIds: [part.id],
        references: [endpoint.reference],
        detail: `${part.name}: supply a manufacturer pin map for ${port}.`,
      });
    }

    requirements.push(
      ...(map?.unresolved ?? []).map((detail) => ({
        code: 'unsupported-connection',
        partIds: [part.id],
        references: endpoints.slice(start).map((end) => end.reference),
        detail,
      })),
    );

    if (hasIdentity(input, part.componentId)) continue;

    requirements.push({
      code: 'unknown-component',
      partIds: [part.id],
      references: [],
      detail: `${part.name}: catalog identity is missing.`,
    });
  }

  return { endpoints, requirements };
}
