import { wiringNetlist } from './netlist';
import { electricalBudgets } from './electricalBudgets';
import { electricalEndpoints, partPinMap } from './electricalEndpoints';
import { electricalGraph } from './electricalGraph';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import type { ElectricalInput, ElectricalProjection } from './electricalTypes';
import { validateElectrical } from './electricalValidation';
import { addPowerInterfaces } from './electricalPowerInterfaces';
import { connectElectrical } from './electricalConnections';
import { electricalRails } from './electricalRails';

function nameNets(projection: ElectricalProjection) {
  const busByPart = new Map(
    projection.wiring.buses.flatMap((bus, index) => [
      ...bus.servos.map((servo): [string, number] => [servo.id, index]),
      ...(bus.adapter ? [[bus.adapter, index] as [string, number]] : []),
    ]),
  );
  const endpoints = new Map(projection.endpoints.map((end) => [end.reference, end]));
  const names = new Map<string, number>();

  for (const net of projection.nets) {
    const buses = net.nodes
      .map((node) => endpoints.get(node.reference)?.partId)
      .flatMap((id) => (id && busByPart.has(id) ? [busByPart.get(id)!] : []));
    const memberships = [...new Set(buses)].sort((a, b) => a - b);
    const bus = memberships[0];
    const base = `${net.function.toUpperCase()}_${bus ?? net.name}`;
    const count = names.get(base) ?? 0;

    names.set(base, count + 1);
    net.bus = bus ?? null;
    net.buses = memberships;
    net.name = count ? `${base}_${count + 1}` : base;
  }
}

export function electricalProjection(input: ElectricalInput): ElectricalProjection {
  const maps = input.pinMaps ?? ELECTRICAL_PIN_MAPS;
  const { endpoints, requirements } = electricalEndpoints(input, maps);
  const wiring = input.wiring ?? wiringNetlist(input);
  const projection: ElectricalProjection = {
    schema: 1,
    endpoints,
    requirements,
    nets: [],
    wiring: structuredClone(wiring),
    inputs: structuredClone({ parts: input.parts, project: input.project }),
    completeness: 'draft',
    electricalVerdict: 'not-established',
    powerBudget: null,
  };

  addPowerInterfaces(projection);

  const graph = electricalGraph(endpoints);
  const byPart = new Map<string, typeof endpoints>();

  for (const endpoint of endpoints) {
    if (!endpoint.partId) continue;

    const group = byPart.get(endpoint.partId) ?? [];

    group.push(endpoint);
    byPart.set(endpoint.partId, group);
  }

  for (const part of input.parts) {
    const map = partPinMap(part, maps);

    if (map) graph.common(map, byPart.get(part.id) ?? []);
  }

  connectElectrical(projection, graph);
  projection.nets = graph.nets();
  nameNets(projection);
  projection.requirements.push(...electricalBudgets(projection, input.walk));
  projection.requirements.push(...electricalRails(projection), ...validateElectrical(projection));
  projection.completeness = projection.requirements.length ? 'draft' : 'mapped';

  return projection;
}
