import { endpointIndex } from './electricalEndpoints';
import type { electricalGraph } from './electricalGraph';
import type { ElectricalEndpoint, ElectricalPin, ElectricalProjection } from './electricalTypes';

type Graph = ReturnType<typeof electricalGraph>;

type Side = 'from' | 'to';

function pinsFor(end: ElectricalEndpoint, side: Side) {
  const pins = end.map?.pins ?? [];
  const terminals = end.map?.terminals;
  const terminal = side === 'from' ? terminals?.output : terminals?.input;

  return terminals ? pins.filter((pin) => pin.number === terminal) : pins;
}

function joinPins(
  graph: Graph,
  ends: [ElectricalEndpoint, ElectricalEndpoint],
  pins: [ElectricalPin[], ElectricalPin[]],
) {
  for (const pin of pins[0]) {
    const matching = pins[1].filter((target) => target.function === pin.function);

    for (const target of matching)
      graph.join(
        { reference: ends[0].reference, pin: pin.number },
        { reference: ends[1].reference, pin: target.number },
      );
  }
}

export function connectElectrical(projection: ElectricalProjection, graph: Graph) {
  const endpoint = endpointIndex(projection.endpoints);

  for (const net of [...projection.wiring.buses.flatMap((bus) => bus.nets), ...projection.wiring.power.nets]) {
    const from = endpoint(net.from);
    const to = endpoint(net.to);

    if (!from?.map || !to?.map) continue;

    joinPins(graph, [from, to], [pinsFor(from, 'from'), pinsFor(to, 'to')]);
  }

  const source = projection.wiring.power.source && endpoint(projection.wiring.power.source);

  if (!source?.map) return;

  const grounds = source.map.pins.filter((pin) => pin.function === 'ground');
  const powerEnds = projection.wiring.power.nets
    .flatMap((net) => [net.from, net.to])
    .map(endpoint)
    .filter((end): end is ElectricalEndpoint => !!end);

  for (const target of powerEnds)
    joinPins(graph, [source, target], [grounds, (target.map?.pins ?? []).filter((pin) => pin.function === 'ground')]);
}
