import type { CheckRow } from '../utils/engineeringTypes';
import { electricalClient, type ElectricalInspection } from './electricalClient';
import { electricalSnapshot, electricalWalk } from './electricalSnapshot';
import type { ElectricalInput } from './electricalTypes';
import { engineeringFinding } from '../readiness/wording';
import { jsonHash } from '../utils/geometryHash';

export const ELECTRICAL_CHECK = 'Electrical connections';

export function electricalRows(inspection: ElectricalInspection): CheckRow[] {
  const items = inspection.requirements.map((requirement) => ({
    text: requirement.detail,
    ids: requirement.partIds,
    status: 'fail' as const,
  }));

  return [{ check: ELECTRICAL_CHECK, status: items.length ? 'fail' : 'pass', detail: '', items }];
}

export function electricalFindings(inspection: ElectricalInspection) {
  return inspection.requirements.map((requirement) => {
    const finding = engineeringFinding(ELECTRICAL_CHECK, 'blocker', {
      detail: requirement.detail,
      ids: requirement.partIds,
    });

    return { ...finding, key: `${finding.key}:${jsonHash([requirement.code, requirement.detail])}` };
  });
}

export async function inspectElectrical(input: ElectricalInput) {
  const snapshot = electricalSnapshot(input);

  if (!snapshot.parts.length) return { rows: [], findings: [] };

  const client = electricalClient();

  try {
    const inspection = await client.call('inspect', {
      ...snapshot,
      walk: electricalWalk(input.walk),
      wiring: input.wiring,
    });

    return { rows: electricalRows(inspection), findings: electricalFindings(inspection) };
  } finally {
    client.dispose();
  }
}
