import type { VisionResult } from '../vision/protocol';
import { obstacleDistance, OBSTACLE_DISTANCE_M } from './visionDepth';
import type { DataType, VisionSelector } from './schema';

export interface PerceptionReading {
  num: number;
  at: number;
}

export interface PerceptionSelector extends VisionSelector {
  maxAgeMs?: number;
}

export interface RoutinePerception {
  read: (model: string, type: DataType, atMs: number, selector?: PerceptionSelector) => PerceptionReading | undefined;
}

export const VISION_MODELS: ReadonlySet<string> = new Set([
  'person-detection',
  'object-detection',
  'obstacle-near',
  'face-detection',
  'pose',
]);

export class RoutineVision implements RoutinePerception {
  private readonly results = new Map<string, VisionResult>();

  push(result: VisionResult) {
    const key = `${result.camera}:${result.modelId}`;
    const previous = this.results.get(key);

    if (!previous || previous.timestamp <= result.timestamp) this.results.set(key, result);
  }

  read(model: string, type: DataType, atMs: number, selector?: PerceptionSelector): PerceptionReading | undefined {
    const camera = selector?.camera;
    const result = [...this.results.values()]
      .filter((r) => r.modelId === model && (!camera || r.camera === camera))
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!result || result.timestamp > atMs || atMs - result.timestamp > (selector?.maxAgeMs ?? Infinity))
      return undefined;

    if (model === 'obstacle-near') {
      const distance = obstacleDistance(result.depth);

      return distance === undefined
        ? undefined
        : { num: type === 'boolean' ? Number(distance <= OBSTACLE_DISTANCE_M) : distance, at: result.timestamp };
    }

    const detections = (result.detections ?? []).filter((d) => !selector?.className || d.label === selector.className);
    const count =
      model === 'person-detection' ? detections.filter((d) => d.label === 'person').length : detections.length;

    return { num: type === 'boolean' ? Number(count > 0) : count, at: result.timestamp };
  }
}
