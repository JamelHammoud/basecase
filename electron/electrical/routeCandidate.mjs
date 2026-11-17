import { boardDigest, BOARD_CLI_VERSION } from '../../src/wiring/boardNativeContract.mjs';
import { runNativeBoard } from './validate.mjs';

export async function nativeRouteCandidate({ request, pcb, signal, temporaryRoot, cli, normalize }) {
  const result = await runNativeBoard(
    { ...request, pcb, boardHash: await boardDigest(pcb) },
    { signal, temporaryRoot, cli, exportFabrication: false },
  );
  const ids = danglingRouteItems(result);

  return ids.length ? normalize(ids) : pcb;
}

export function danglingRouteItems(result) {
  if (result.version !== BOARD_CLI_VERSION) throw new Error('board-validator');

  if (result.issues.length === 0) return [];

  if (result.issues.length !== 1 || result.issues[0] !== 'board-drc')
    throw new Error(result.issues[0] ?? 'board-validation');

  const report = JSON.parse(result.report ?? 'null');

  if (!connectedNativeReport(report)) throw new Error('board-drc');

  if (
    !Array.isArray(report.violations) ||
    !report.violations.length ||
    report.violations.length > 4096 ||
    !report.violations.every(danglingViolation)
  )
    throw new Error('board-drc');

  return [...new Set(report.violations.map((violation) => violation.items[0].uuid))];
}

function connectedNativeReport(report) {
  return !(
    report?.kicad_version !== BOARD_CLI_VERSION ||
    !Array.isArray(report.unconnected_items) ||
    report.unconnected_items.length ||
    !Array.isArray(report.schematic_parity) ||
    report.schematic_parity.length
  );
}

function danglingViolation(violation) {
  return (
    violation?.type === 'track_dangling' &&
    violation.severity === 'warning' &&
    Array.isArray(violation.items) &&
    violation.items.length === 1 &&
    typeof violation.items[0]?.uuid === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(violation.items[0].uuid)
  );
}
