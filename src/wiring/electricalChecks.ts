import type { CheckRow } from '../utils/engineeringTypes';
import { electricalClient, type ElectricalInspection } from './electricalClient';
import { electricalSnapshot, electricalWalk } from './electricalSnapshot';
import type { ElectricalInput } from './electricalTypes';
import { engineeringFinding } from '../readiness/wording';
import { jsonHash } from '../utils/geometryHash';
import { sourcedMeshFiles } from '../three/componentMeshes';

export const ELECTRICAL_CHECK = 'Electrical connections';
export const BOARD_FIT_CHECK = 'Board fit';

const BOARD_FIT_CODES = new Set([
  'board-outline',
  'board-hole',
  'board-overlap',
  'board-access',
  'board-height',
  'board-thickness',
  'board-geometry',
  'board-stale-geometry',
  'board-stale-placement',
  'board-collision',
  'board-fit',
  'board-mounting',
]);
const checkFor = (code: string) => (BOARD_FIT_CODES.has(code) ? BOARD_FIT_CHECK : ELECTRICAL_CHECK);

export function electricalRows(inspection: ElectricalInspection): CheckRow[] {
  const checks = inspection.board ? [ELECTRICAL_CHECK, BOARD_FIT_CHECK] : [ELECTRICAL_CHECK];

  return checks.map((check) => {
    const items = inspection.requirements
      .filter((requirement) => checkFor(requirement.code) === check)
      .map((requirement) => ({
        text: requirement.detail,
        ids: requirement.partIds,
        status: 'fail' as const,
      }));

    return { check, status: items.length ? 'fail' : 'pass', detail: '', items };
  });
}

export function electricalFindings(inspection: ElectricalInspection) {
  return inspection.requirements.map((requirement) => {
    const finding = engineeringFinding(checkFor(requirement.code), 'blocker', {
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
      meshFiles: snapshot.project.electronicsBoard ? await sourcedMeshFiles(snapshot.parts) : undefined,
    });

    return { rows: electricalRows(inspection), findings: electricalFindings(inspection) };
  } finally {
    client.dispose();
  }
}
