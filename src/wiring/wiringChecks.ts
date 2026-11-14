import type { CheckRow } from '../utils/engineeringTypes';
import { plural } from '../../electron/plural.mjs';
import { CONNECTOR_NAMES } from './connectors';
import type { Netlist } from './netlist';

export const SERVO_BUS_CHECK = 'Servo bus';

export function wiringRows(netlist: Netlist): CheckRow[] {
  const items = netlist.buses.flatMap((bus) => {
    const ids = bus.servos.map((s) => s.id).filter((id) => netlist.unmatched.includes(id));

    return ids.length
      ? [{ text: `Add a ${CONNECTOR_NAMES[bus.connector]} bus adapter for ${plural(ids.length, 'servo')}.`, ids }]
      : [];
  });

  if (!items.length) return [];

  return [
    {
      check: SERVO_BUS_CHECK,
      status: 'fail',
      detail: items.map((i) => i.text).join(' '),
      ids: items.flatMap((i) => i.ids),
      items,
    },
  ];
}
