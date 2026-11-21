import { BOARD_CLI_VERSION, boardDigest, boardEvidenceKey, connectedBoardReport } from './boardNativeContract.mjs';
import { boardImportMessage } from './boardRoutingFindings';
import type { ElectronicsBoard } from './boardTypes';
import type { BoardNativeRequest, BoardNativeResult } from './boardRoutingTypes';

export async function acceptBoardRoute(input: {
  board: ElectronicsBoard;
  request: BoardNativeRequest;
  result: BoardNativeResult;
}): Promise<ElectronicsBoard> {
  const { board, request, result } = input;
  const routed = board.routed;

  if (
    !routed ||
    routed.hash !== request.boardHash ||
    routed.sourceFingerprint !== request.sourceFingerprint ||
    (await boardDigest(routed.pcb)) !== request.boardHash ||
    result.key !== (await boardEvidenceKey(request))
  )
    throw new Error(boardImportMessage('board-stale-routing'));

  if (result.issues.length) throw new Error(boardImportMessage(result.issues[0]));

  if (result.version !== BOARD_CLI_VERSION || !connectedBoardReport(result))
    throw new Error(boardImportMessage('board-validation'));

  const evidence = {
    key: result.key,
    version: result.version,
    issues: result.issues,
    report: result.report,
    metrics: result.metrics,
  };

  return { ...board, routed: { ...routed, evidence } };
}
