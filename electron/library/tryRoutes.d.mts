import type { TryLibrary } from './tryLibrary.mjs';

export type TryCall = (tries: TryLibrary, payload?: unknown) => unknown;

export const TRY_CALLS: Record<string, TryCall>;

export function registerTryHandlers(
  ipcMain: { handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => void },
  tries: TryLibrary,
): void;

export function tryPostRoutes(tries: TryLibrary): Array<[string, (body: { arg?: unknown } | undefined) => Promise<unknown>]>;
