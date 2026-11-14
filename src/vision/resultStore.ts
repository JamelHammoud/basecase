import type { VisionResult } from './protocol';

const listeners = new Set<() => void>();
let results: readonly VisionResult[] = [];

export const visionResults = () => results;

export function onVisionResults(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function keepVisionResult(result: VisionResult): void {
  const matches = (known: VisionResult) => known.camera === result.camera && known.modelId === result.modelId;
  const previous = results.find(matches);

  if (previous && previous.timestamp > result.timestamp) return;

  results = [...results.filter((known) => !matches(known)), result];
  listeners.forEach((listener) => listener());
}

export function latestVision(camera: string, modelId?: string): VisionResult | null {
  return results
    .filter((result) => result.camera === camera && (!modelId || result.modelId === modelId))
    .reduce<VisionResult | null>(
      (latest, result) => (!latest || result.timestamp > latest.timestamp ? result : latest),
      null,
    );
}

export function clearVisionResults(camera?: string, modelId?: string): void {
  results = results.filter((result) => (camera && result.camera !== camera) || (modelId && result.modelId !== modelId));
  listeners.forEach((listener) => listener());
}
