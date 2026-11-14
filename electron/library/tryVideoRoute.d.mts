import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TryStore } from './tryStore.mjs';

export const TRY_VIDEO_PATH: string;

export function byteRange(header: unknown, size: number): { start: number; end: number } | null | false;

export function tryVideoResponse(store: TryStore, request: Request): Response | null;

export function tryVideoMiddleware(
  store: TryStore,
): (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse) => void;
