import { plural } from '../../electron/plural.mjs';
import { CONNECTOR_NAMES, type BusChain, type NetEnd, type Netlist } from './connectors';
import { lengthLabel } from '../utils/size';
import { SUPPLY_BY_ID } from '../data/supplies';

const endText = (e: NetEnd) => `${e.name}${e.id ? ` [${e.id}]` : ''} (${CONNECTOR_NAMES[e.connector]})`;

function busLine(bus: BusChain, i: number): string {
  const ids = new Map(bus.servos.map((s) => [s.id, s.busId]));
  const hops = bus.nets.map((net) => {
    const id = net.to.id ? ids.get(net.to.id) : null;

    return `${endText(net.to)}${id ? ` servo id ${id}` : ''}`;
  });

  return `- Bus ${i + 1}: ${[endText(bus.nets[0].from), ...hops].join(' → ')}; ${plural(bus.nets.length, `${CONNECTOR_NAMES[bus.connector]} cable`)}`;
}

export function wiringText(netlist: Netlist): string[] {
  if (!netlist.buses.length && !netlist.power.nets.length) return [];

  const power = netlist.power.nets.map((net) => `- Power: ${endText(net.from)} → ${endText(net.to)}`);
  const routes = [...netlist.buses.flatMap((bus) => bus.nets), ...netlist.power.nets].flatMap((net) => {
    const route = net.route;

    if (!route) return [];

    const from = `${endText(net.from)} ${net.from.port?.name ?? ''}`.trim();
    const to = `${endText(net.to)} ${net.to.port?.name ?? ''}`.trim();
    const required = route.requiredMm === null ? '' : lengthLabel(route.requiredMm);
    const cable = route.cableSupplyId ? SUPPLY_BY_ID[route.cableSupplyId]?.name : '';
    const length = route.lengthMm === null ? '' : lengthLabel(route.lengthMm);

    return [`- ${from} → ${to}: ${[required, cable, length, route.reason].filter(Boolean).join(', ')}`];
  });

  return [
    '',
    'Wiring, from the connector ports. Servo buses daisy-chain in servo id order (the numbering Operate and joint_map.json use), adapter first:',
    ...netlist.buses.map(busLine),
    ...power,
    ...routes,
    ...(netlist.unmatched.length ? [`- No adapter takes the connector on: ${netlist.unmatched.join(', ')}`] : []),
  ];
}
