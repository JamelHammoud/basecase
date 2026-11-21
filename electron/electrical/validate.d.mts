import type { BoardNativeRequest, BoardNativeResult } from '../../src/wiring/boardRoutingTypes';

export function runNativeBoard(
  request: BoardNativeRequest,
  options?: {
    cli?: (args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;
    signal?: AbortSignal;
    temporaryRoot?: string;
    exportFabrication?: boolean;
  },
): Promise<BoardNativeResult>;
