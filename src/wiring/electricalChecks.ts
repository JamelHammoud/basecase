import type { CheckRow } from '../utils/engineeringTypes';
import { electricalClient, type ElectricalInspection } from './electricalClient';
import { electricalSnapshot, electricalWalk } from './electricalSnapshot';
import type { ElectricalInput } from './electricalTypes';

export const ELECTRICAL_CHECK = 'Electrical connections';

export function electricalRows(inspection: ElectricalInspection): CheckRow[] {
  const items = inspection.requirements.map((requirement) => ({
    text: requirement.detail,
    ids: requirement.partIds,
    status: 'fail' as const,
  }));

  return [{ check: ELECTRICAL_CHECK, status: items.length ? 'fail' : 'pass', detail: '', items }];
}

export async function inspectElectrical(input: ElectricalInput) {
  const snapshot = electricalSnapshot(input);

  if (!snapshot.parts.length) return [];

  const client = electricalClient();

  try {
    return electricalRows(
      await client.call('inspect', { ...snapshot, walk: electricalWalk(input.walk), wiring: input.wiring }),
    );
  } finally {
    client.dispose();
  }
}
