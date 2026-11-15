import type { TryStore } from './tryStore.mjs';

export const TRY_VIDEO_PREFIX: string;
export function tryVideoResponse(request: Request, store: Pick<TryStore, 'videoFile'>): Response;
export function tryVideoRequest(request: Request, store: TryStore): Promise<Response>;
