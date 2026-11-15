import { frameHash, type FrameSet, type ImageAnnotation } from '../frameSet';
import { encodeMask } from '../imageMasks';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { VisionResult } from '../types';
import { defaultTrainingMetric, evaluateTraining } from './metrics';
import type { TrainingTask } from './types';

const annotation = (classId = 1): ImageAnnotation => ({
  instance: `object-${classId}`,
  classId,
  box: [0, 0, 2, 2],
  mask: encodeMask(new Uint8Array([1, 1, 1, 1]), 2, 2),
  polygons: [[0, 0, 2, 0, 2, 2, 0, 2]],
  keypoints: [{ name: 'center', x: 1, y: 1, visible: true }],
});

export function metricSet(): FrameSet {
  return {
    version: 1,
    id: 'images',
    name: 'Images',
    caseId: null,
    sceneId: null,
    seed: 0,
    classes: [
      { id: 1, name: 'Cup', keypoints: ['center'] },
      { id: 2, name: 'Plate', keypoints: ['center'] },
    ],
    createdAt: '2026-11-15T00:00:00Z',
    frames: [
      {
        id: 'one',
        seed: 0,
        camera: 'camera',
        width: 2,
        height: 2,
        jpeg: new Uint8Array([255, 216, 255, 217]),
        depth: new Float32Array(4),
        annotations: [annotation()],
        source: 'try',
        origin: { tryId: 'real', frame: 0, seconds: 0 },
      },
    ],
  };
}

export async function metricSnapshot(set = metricSet()): Promise<FrozenImageSample[]> {
  return Promise.all(
    set.frames.map(async (frame) => ({
      frameSetId: set.id,
      frameId: frame.id,
      source: 'try:real',
      hash: await frameHash(frame),
      content: 'a'.repeat(64),
      split: 'test' as const,
    })),
  );
}

export function metricTask(kind: TrainingTask['kind'] = 'detect'): TrainingTask {
  return { kind, classes: metricSet().classes, metric: defaultTrainingMetric(kind), limits: {} };
}

export const metricResult = (overrides: Partial<VisionResult> = {}): VisionResult => ({
  modelId: 'candidate',
  timestamp: 0,
  width: 2,
  height: 2,
  detections: [{ label: metricSet().classes[0].name, score: 0.9, box: [0, 0, 1, 1] }],
  ...overrides,
});

export async function metricReport(kind: TrainingTask['kind'] = 'detect', value = metricResult()) {
  const set = metricSet();

  return evaluateTraining({
    task: metricTask(kind),
    sets: [set],
    snapshot: await metricSnapshot(set),
    realSourceIds: ['try:real'],
    predictions: [{ frameSetId: set.id, frameId: 'one', result: value, inferenceMs: 4 }],
    modelHash: 'b'.repeat(64),
    modelBytes: 1024,
  });
}
