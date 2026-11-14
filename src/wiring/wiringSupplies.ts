import type { ConnectorType } from '../types/ports';
import type { Netlist } from './connectors';

const BUS_CABLES: Partial<Record<ConnectorType, string>> = {
  '5264-3': 'servo-cable-5264-3pin',
  'jst-eh-3': 'robot-cable-x3p',
};

const PIGTAILS: Partial<Record<ConnectorType, string>> = {
  xt60: 'xt60-pigtail',
  ec5: 'ec5-pigtail',
  'dc-barrel': 'dc-barrel-pigtail',
};

export function wiringSupplies(netlist: Netlist): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (supply: string | undefined) => {
    if (supply) counts.set(`supply:${supply}`, (counts.get(`supply:${supply}`) ?? 0) + 1);
  };

  for (const net of netlist.buses.flatMap((b) => b.nets)) add(BUS_CABLES[net.to.connector]);

  for (const net of netlist.power.nets) [net.from, net.to].forEach((end) => add(PIGTAILS[end.connector]));

  return counts;
}
