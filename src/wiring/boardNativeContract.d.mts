import type { BoardNativeRequest, BoardFabricationRules, BoardNativeResult } from './boardRoutingTypes';

export const BOARD_CLI_VERSION: string;
export const BOARD_OUTPUT_LIMIT: number;
export function boardDigest(value: string | Uint8Array<ArrayBuffer>): Promise<string>;
export function boardEvidenceKey(request: BoardNativeRequest): Promise<string>;
export function completeBoardRules(rules: BoardFabricationRules | null): boolean;
export function explicitBoardStackup(pcb: string): boolean;

export function boardProject(rules: BoardFabricationRules | null): string;

export function connectedBoardReport(result: Pick<BoardNativeResult, 'version' | 'report' | 'issues'>): boolean;
