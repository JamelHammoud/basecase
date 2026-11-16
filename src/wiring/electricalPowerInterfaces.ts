import type { ElectricalEndpoint, ElectricalPin, ElectricalProjection } from './electricalTypes';
import type { NetEnd } from './connectors';
import { selectedPowerModule } from './electricalModules';

const source = 'https://gitlab.com/kicad/libraries/kicad-symbols/-/tree/9.0.6';
const terminal = (number: string, ground = false): ElectricalPin => ({
  number,
  name: number,
  function: ground ? 'ground' : 'positive',
  direction: 'passive',
});

function interfacePins(name: string) {
  if (name === 'Inline Fuse Holder' || name === 'Power Switch') return [terminal('IN'), terminal('OUT')];

  return [terminal('+'), terminal('-', true)];
}

export function powerInterface(end: NetEnd, index: number): ElectricalEndpoint {
  return {
    reference: `J${index + 1}`,
    partId: end.id,
    componentId: null,
    variant: null,
    name: end.name,
    port: end.port?.name ?? end.name,
    map: {
      port: end.port?.name ?? end.name,
      connector: end.connector,
      source,
      sourceLocator:
        'Functional connector, fuse or SPST requirement. Terminal names are design requirements, not manufacturer pin numbers.',
      basis: 'requirement',
      pins: interfacePins(end.name),
      ...(['Inline Fuse Holder', 'Power Switch'].includes(end.name)
        ? { terminals: { input: 'IN', output: 'OUT' } }
        : {}),
    },
  };
}

export function addPowerInterfaces(projection: ElectricalProjection) {
  const known = new Set(projection.endpoints.map((end) => JSON.stringify([end.partId, end.port])));
  const ends = projection.wiring.power.nets.flatMap((net) => [net.from, net.to]);

  for (const end of ends) {
    const key = JSON.stringify([end.id, end.port?.name ?? end.name]);

    if (known.has(key)) continue;

    known.add(key);

    const endpoint = powerInterface(end, projection.endpoints.length);
    const selected = selectedPowerModule(projection.inputs.project, end.name);

    if (selected) {
      endpoint.map = structuredClone(selected.module.map);
      endpoint.moduleId = selected.module.id;
      endpoint.sourcedItemId = selected.item.id;
    }

    projection.endpoints.push(endpoint);

    if (selected && end.name !== 'Inline Fuse Holder') continue;

    projection.requirements.push({
      code: selected ? 'fuse-rating' : 'unresolved-power-interface',
      partIds: end.id ? [end.id] : [],
      references: [endpoint.reference],
      detail: selected
        ? 'Select an ATO fuse rating for the holder.'
        : `${end.name}: choose an exact product and confirm its terminals and ratings.`,
    });
  }
}
