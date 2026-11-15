import type { VisionTrainingStore } from './store.mjs';

export const VISION_TRAINING_CALLS: Record<string, (store: VisionTrainingStore, payload?: unknown) => unknown>;

export function registerVisionTrainingHandlers(
  ipcMain: { handle: (channel: string, listener: (event: unknown, payload?: unknown) => unknown) => void },
  store: VisionTrainingStore,
): void;

export function visionTrainingPostRoutes(
  store: VisionTrainingStore,
): Array<[string, (body: { arg?: unknown } | null) => Promise<unknown>]>;
