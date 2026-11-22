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

const REGION_KEY = /^vision\.[^.]+\.(zone|line)\.[^.]+$/u;
const REGION_FIELDS = { zone: ['count', 'dwell'], line: ['in', 'out'] } as const;

export const visionRegionSignalName = (name: string) => visionSignalClass(name);

export function trackingSignalNames(camera: string | undefined, tracking: VisionResult['tracking']): string[] {
  return [
    ...new Set((tracking?.tracks ?? []).map((track) => `vision.${camera}.${visionSignalClass(track.label)}.tracks`)),
    ...(tracking?.zones ?? []).map((zone) => `vision.${camera}.zone.${visionRegionSignalName(zone.name)}`),
    ...(tracking?.lines ?? []).map((line) => `vision.${camera}.line.${visionRegionSignalName(line.name)}`),
  ];
}

function addTracking(
  values: Record<string, number>,
  result: VisionResult,
  preferred: Map<string, VisionResult>,
  regionOwner: boolean,
) {
  const tracking = result.tracking;

  if (!tracking) return;

  for (const track of tracking.tracks) {
    if (preferred.get(labelKey(result.camera, track.label)) !== result) continue;

    const key = `vision.${result.camera}.${visionSignalClass(track.label)}.tracks`;

    values[key] = (values[key] ?? 0) + 1;
  }

  if (!regionOwner) return;

  for (const zone of tracking.zones) {
    const key = `vision.${result.camera}.zone.${visionRegionSignalName(zone.name)}`;

    values[`${key}.count`] = zone.count;
    values[`${key}.dwell`] = zone.dwell;
  }

  for (const line of tracking.lines) {
    const key = `vision.${result.camera}.line.${visionRegionSignalName(line.name)}`;

    values[`${key}.in`] = line.in;
    values[`${key}.out`] = line.out;
  }
}

function zeroKnown(values: Record<string, number>, key: string) {
  const region = REGION_KEY.exec(key)?.[1] as keyof typeof REGION_FIELDS | undefined;

  if (region) {
    for (const field of REGION_FIELDS[region]) values[`${key}.${field}`] = 0;

    return;
  }

  values[key] = 0;

  if (key.endsWith('.tracks')) return;

  for (const field of FIELDS) values[`${key}.${field}`] = 0;
}

export function visionSignalValues(results: VisionResult[], known: string[] = []): Record<string, number> {
  const values: Record<string, number> = {};
  const preferred = preferredModels(results);
  const regions = new Map<string, VisionResult>();

  for (const key of known) zeroKnown(values, key);

  for (const result of results) {
    for (const detection of result.detections) {
      if (preferred.get(labelKey(result.camera, detection.label)) === result)
        addDetection(values, result.camera, detection);
    }

    if (result.tracking && result.timestamp >= (regions.get(`${result.camera}`)?.timestamp ?? -Infinity))
      regions.set(`${result.camera}`, result);
  }

  for (const result of results) addTracking(values, result, preferred, regions.get(`${result.camera}`) === result);

  return values;
}
