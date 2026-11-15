import type { VisionDetection, VisionResult } from '../vision/types';

export const visionSignalClass = (label: string) => label.toLowerCase().replaceAll(/[^a-z0-9_-]+/gu, '_');

const FIELDS = ['score', 'x', 'y', 'width', 'height'] as const;
const labelKey = (camera: string | undefined, label: string) => `${camera}:${label}`;

function preferredModels(results: VisionResult[]): Map<string, VisionResult> {
  const preferred = new Map<string, VisionResult>();
  const scores = new Map<string, number>();

  for (const result of results) {
    for (const detection of result.detections) {
      const key = labelKey(result.camera, detection.label);

      if (detection.score < (scores.get(key) ?? -Infinity)) continue;

      scores.set(key, detection.score);
      preferred.set(key, result);
    }
  }

  return preferred;
}

export function preferredVisionDetections(results: VisionResult[]): VisionDetection[] {
  const preferred = preferredModels(results);

  return results.flatMap((result) =>
    result.detections.filter((detection) => preferred.get(labelKey(result.camera, detection.label)) === result),
  );
}

function addDetection(values: Record<string, number>, camera: string | undefined, detection: VisionDetection) {
  const key = `vision.${camera}.${visionSignalClass(detection.label)}`;

  values[key] = (values[key] ?? 0) + 1;

  if (detection.score < (values[`${key}.score`] ?? -Infinity)) return;

  const [x, y, width, height] = detection.box;
  const top = { score: detection.score, x, y, width, height };

  for (const field of FIELDS) values[`${key}.${field}`] = top[field];
}

export function visionSignalValues(results: VisionResult[], known: string[] = []): Record<string, number> {
  const values: Record<string, number> = {};
  const preferred = preferredModels(results);

  for (const key of known) {
    values[key] = 0;

    for (const field of FIELDS) values[`${key}.${field}`] = 0;
  }

  for (const result of results) {
    for (const detection of result.detections) {
      if (preferred.get(labelKey(result.camera, detection.label)) === result)
        addDetection(values, result.camera, detection);
    }
  }

  return values;
}
