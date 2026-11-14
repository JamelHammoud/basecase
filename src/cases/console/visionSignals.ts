import { visionModel } from '../../vision/manifest';
import type { VisionDetection, VisionResult } from '../../vision/protocol';

export const VISION_BOX_FIELDS = ['score', 'x', 'y', 'width', 'height', 'timestamp', 'ageMs'] as const;

const className = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-|-$/gu, '');

function classValues(
  prefix: string,
  detections: VisionDetection[],
  captured: { timestamp: number; ageMs: number },
): Record<string, number> {
  const top = detections.reduce<VisionDetection | null>((best, d) => (!best || d.score > best.score ? d : best), null);
  const [x, y, width, height] = top?.box ?? [0, 0, 0, 0];

  return {
    [prefix]: detections.length,
    [`${prefix}.count`]: detections.length,
    [`${prefix}.score`]: top?.score ?? 0,
    [`${prefix}.x`]: x,
    [`${prefix}.y`]: y,
    [`${prefix}.width`]: width,
    [`${prefix}.height`]: height,
    [`${prefix}.timestamp`]: captured.timestamp,
    [`${prefix}.ageMs`]: captured.ageMs,
  };
}

export function visionSignalValues(results: readonly VisionResult[], atMs: number, maxAgeMs = Infinity) {
  const values: Record<string, number> = {};
  const newest = [...results].sort((a, b) => a.timestamp - b.timestamp);

  for (const result of newest) {
    const fresh = Number.isFinite(result.timestamp) && result.timestamp <= atMs && atMs - result.timestamp <= maxAgeMs;

    if (!fresh) continue;

    const labels = new Set(
      [...(visionModel(result.modelId)?.classes ?? []), ...(result.detections?.map((d) => d.label) ?? [])].filter(
        Boolean,
      ),
    );

    for (const label of labels) {
      const matches = result.detections?.filter((d) => d.label === label) ?? [];
      const prefix = `vision.${result.camera}.${className(label)}`;

      Object.assign(
        values,
        classValues(prefix, matches, { timestamp: result.timestamp, ageMs: atMs - result.timestamp }),
      );
    }
  }

  return values;
}
