import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTrainingFrame, type TrainingFrame } from './frameSet';
import { decodeMask } from './imageMasks';
import { labelGeometry } from './labelEdits';
import { prelabelFrameLabels } from './prelabelsGeometry';
import type { VisionResult } from './types';

const frame = (): TrainingFrame => ({
  id: 'frame',
  seed: 1,
  camera: 'Scene',
  width: 4,
  height: 4,
  jpeg: new Uint8Array([255, 216, 255, 217]),
  depth: new Float32Array(16),
  annotations: [],
});
const result = (): VisionResult => ({
  modelId: 'test',
  timestamp: 0,
  width: 4,
  height: 4,
  detections: [{ label: 'cup', score: 0.9, box: [0.25, 0.25, 0.5, 0.5] }],
});

afterEach(() => vi.unstubAllGlobals());

describe('model frame prelabels', () => {
  it('matches class names, converts normalized boxes, and preserves source labels', () => {
    const source = frame();
    const manual = labelGeometry({ width: 4, height: 4, instance: 'manual', classId: 7, box: [0, 0, 1, 1] });
    const accepted = { ...manual, instance: 'accepted', source: 'model' as const };
    const previous = { ...manual, instance: 'old', review: 'suggested' as const, source: 'model' as const };

    source.annotations = [manual, accepted, previous];

    const labels = prelabelFrameLabels({ frame: source, classes: [{ id: 7, name: 'Cup' }], result: result() });

    expect(labels.classes).toEqual([{ id: 7, name: 'Cup' }]);
    expect(labels.annotations.slice(0, 2)).toEqual([manual, accepted]);
    expect(labels.annotations[2]).toMatchObject({
      classId: 7,
      box: [1, 1, 2, 2],
      source: 'model',
      review: 'suggested',
    });
    expect(source.annotations).toEqual([manual, accepted, previous]);
    expect(() => validateTrainingFrame({ ...source, annotations: labels.annotations }, labels.classes)).not.toThrow();
  });

  it('scales full-frame masks with nearest sampling and retains named keypoints', () => {
    const prediction = result();

    prediction.detections[0] = {
      ...prediction.detections[0],
      mask: { width: 2, height: 2, values: new Uint8Array([1, 0, 0, 1]) },
      keypoints: [
        [0.5, 0.25],
        [1, -0.2],
      ],
    };

    const labels = prelabelFrameLabels({ frame: frame(), classes: [], result: prediction });
    const annotation = labels.annotations[0];

    expect(labels.classes).toEqual([{ id: 0, name: 'cup', keypoints: ['point_1', 'point_2'] }]);
    expect([...decodeMask(annotation.mask)]).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]);
    expect(annotation.keypoints).toEqual([
      { name: 'point_1', x: 2, y: 1, visible: true },
      { name: 'point_2', x: 4, y: -0.8, visible: false },
    ]);
    expect(() => validateTrainingFrame({ ...frame(), annotations: labels.annotations }, labels.classes)).not.toThrow();
  });

  it('omits empty masks and boxes outside the frame without adding unused classes', () => {
    const prediction = result();

    prediction.detections = [
      { label: 'empty', score: 1, box: [0, 0, 1, 1], mask: { width: 1, height: 1, values: new Uint8Array([0]) } },
      { label: 'outside', score: 1, box: [2, 2, 1, 1] },
    ];

    expect(prelabelFrameLabels({ frame: frame(), classes: [], result: prediction })).toEqual({
      classes: [],
      annotations: [],
    });
  });

  it('rejects mismatching frame dimensions and malformed masks', () => {
    expect(() => prelabelFrameLabels({ frame: frame(), classes: [], result: { ...result(), width: 5 } })).toThrow(
      'dimensions',
    );

    const prediction = result();

    prediction.detections[0].mask = { width: 2, height: 2, values: new Uint8Array(1) };
    expect(() => prelabelFrameLabels({ frame: frame(), classes: [], result: prediction })).toThrow('mask');
  });
});
