import type { CheckRow } from '../utils/engineeringTypes';
import { plural } from '../../electron/plural.mjs';
import { CONNECTOR_NAMES } from './connectors';
import { mixedBuses, type Netlist } from './netlist';

export const SERVO_BUS_CHECK = 'Servo bus';

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function wiringRows(netlist: Netlist): CheckRow[] {
  const unmatched = netlist.buses.flatMap((bus) => {
    const ids = bus.servos.map((s) => s.id).filter((id) => netlist.unmatched.includes(id));

    return ids.length
      ? [{ text: `Add a ${CONNECTOR_NAMES[bus.connector]} bus adapter for ${plural(ids.length, 'servo')}.`, ids }]
      : [];
  });
  const mixed = mixedBuses(netlist).map((bus) => ({
    text: `Give the ${bus.protocols.map(capital).join(' and ')} servos an adapter each.`,
    ids: bus.servos.map((s) => s.id),
  }));
  const items = [...unmatched, ...mixed];

  if (!items.length) return [];

  return [
    {
      check: SERVO_BUS_CHECK,
      status: 'fail',
      detail: items.map((i) => i.text).join(' '),
      ids: items.flatMap((i) => i.ids ?? []),
      items,
    },
  ];
}
