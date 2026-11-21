import { prepareBoardExport } from './boardExportPreparation';
import {
  boardEvidenceKey,
  BOARD_CLI_VERSION,
  completeBoardRules,
  explicitBoardStackup,
  connectedBoardReport,
} from './boardNativeContract.mjs';
import { boardImportMessage } from './boardRoutingFindings';
import type { ElectricalInput, ElectricalRequirement } from './electricalTypes';

export async function inspectRoutedBoard(input: ElectricalInput) {
  const prepared = await prepareBoardExport(input);
  const report = JSON.parse(prepared.files['requirements.json']);
  const board = input.project.electronicsBoard!;
  const evidence = board.routed!.evidence;
  const fresh = prepared.request && evidence?.key === (await boardEvidenceKey(prepared.request));
  const requirements: ElectricalRequirement[] = [...report.projection.requirements, ...report.board.requirements];
  const issues = [...(fresh ? evidence.issues : [])];

  if (prepared.request && !fresh) issues.push('board-validation');

  if (prepared.request && (!completeBoardRules(prepared.request.rules) || !explicitBoardStackup(prepared.request.pcb)))
    issues.push('board-manufacturing');

  if (fresh && evidence.version !== BOARD_CLI_VERSION) issues.push('board-validator');

  const connected = fresh && connectedBoardReport(evidence);
  const retained = requirements.filter((item) => item.code !== 'board-unrouted' || !connected);

  retained.push(
    ...[...new Set(issues)]
      .filter((code) => !retained.some((item) => item.code === code))
      .map((code) => ({
        code,
        partIds: [board.partId],
        references: [],
        detail: boardImportMessage(code),
      })),
  );

  return { board: true, requirements: retained, powerBudget: report.projection.powerBudget };
}
