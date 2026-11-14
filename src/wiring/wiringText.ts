import { plural } from '../../electron/plural.mjs';
import { CONNECTOR_NAMES, type BusChain, type NetEnd, type Netlist } from './connectors';

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

  return [
    '',
    'Wiring, from the connector ports. Servo buses daisy-chain in servo id order (the numbering Operate and joint_map.json use), adapter first:',
    ...netlist.buses.map(busLine),
    ...power,
    ...(netlist.unmatched.length ? [`- No adapter takes the connector on: ${netlist.unmatched.join(', ')}`] : []),
  ];
}
