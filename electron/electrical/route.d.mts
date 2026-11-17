import type { BoardNativeRequest, BoardRouteResult } from '../../src/wiring/boardRoutingTypes';
import type { BoardRoutePlan } from '../../src/wiring/boardRouteContract.mjs';
import type { boardProcess } from './process.mjs';

export function boundedRouteRequest(input: unknown): void;
export function routeNativeBoard(
  input: { request: BoardNativeRequest; plan: BoardRoutePlan },
  options?: {
    temporaryRoot?: string;
    signal?: AbortSignal;
    tools?: () => Promise<{ java: string; jar: string; python: string }>;
    execute?: typeof boardProcess;
    cli?: (args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;
  },
): Promise<BoardRouteResult>;
