import type { TryStore } from './tryStore.mjs';

export const TRY_CALLS: Record<string, (store: TryStore, payload?: unknown) => unknown>;

export function tryPostRoutes(store: TryStore): Array<[string, (body: { arg?: unknown } | null) => Promise<unknown>]>;
