import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { visionModel } from './catalogue';
import type { VisionOutputs } from './types';

const transform = { width: 640, height: 640, scaledWidth: 640, scaledHeight: 640, left: 0, top: 0 };
const tensor = (data: number[], dims: number[]) => ({ data, dims });
const rfdetr = () => ({
  pred_boxes: tensor([0.5, 0.5, 0.2, 0.2], [1, 1, 4]),
  pred_logits: tensor(Array(91).fill(2), [1, 1, 91]),
});

describe('production vision tensor validation', () => {
  it('refuses truncated, mismatched, nonfinite and oversized RFDETR predictions', () => {
    const valid = rfdetr();
    const malformed = [
      { ...valid, pred_boxes: tensor([0.5], [1, 1, 4]) },
      { ...valid, pred_boxes: tensor([NaN, 0.5, 0.2, 0.2], [1, 1, 4]) },
      { ...valid, pred_logits: tensor(Array(182).fill(2), [1, 2, 91]) },
      { ...valid, pred_logits: tensor(Array(91).fill(Infinity), [1, 1, 91]) },
      { ...valid, pred_boxes: tensor([], [1, 10001, 4]) },
    ];

    for (const outputs of malformed)
      expect(() => decode(outputs, visionModel('rfdetr-nano')!, transform)).toThrow(/tensors/);
  });

  it('refuses malformed YOLO channel arrays instead of returning partial detections', () => {
    const values = Array(84).fill(0);

    values[4] = 0.9;

    const malformed = [tensor(values.slice(1), [1, 84, 1]), tensor(values, [2, 84, 1])];

    values[0] = NaN;
    malformed.push(tensor(values, [1, 84, 1]), tensor([], [1, 84, 10001]));

    for (const output0 of malformed)
      expect(() => decode({ output0 }, visionModel('yolo11n')!, transform)).toThrow(/tensors/);
  });

  it('checks every YuNet stride before accepting any detections', () => {
    const outputs: VisionOutputs = {};

    for (const stride of [8, 16, 32]) {
      const count = (640 / stride) ** 2;

      outputs[`cls_${stride}`] = tensor(Array(count).fill(0), [1, count, 1]);
      outputs[`obj_${stride}`] = tensor(Array(count).fill(0), [1, count, 1]);
      outputs[`bbox_${stride}`] = tensor(Array(count * 4).fill(0), [1, count, 4]);
      outputs[`kps_${stride}`] = tensor(Array(count * 10).fill(0), [1, count, 10]);
    }

    outputs.kps_32 = tensor([], [1, 400, 10]);
    expect(() => decode(outputs, visionModel('yunet')!, transform)).toThrow(/tensors/);
    outputs.kps_32 = tensor(Array(4000).fill(NaN), [1, 400, 10]);
    expect(() => decode(outputs, visionModel('yunet')!, transform)).toThrow(/tensors/);
  });

  it('refuses invalid depth dimensions before reading or allocating their values', () => {
    const data = {
      length: 16777217,
      get 0(): number {
        throw new Error('Read oversized output.');
      },
    };
    const malformed = [
      { data, dims: [1, 1, 16777217] },
      tensor([1, 2], [1, -1, -2]),
      tensor([1, 2], [2, 1, 1]),
      tensor([1, Infinity], [1, 1, 2]),
      tensor([Number.MAX_VALUE], [1, 1, 1]),
    ];

    for (const depth of malformed)
      expect(() => decode({ depth }, visionModel('depth-anything-v2-small')!, transform)).toThrow(/tensors/);

    const result = decode({ depth: tensor([1, 2], [1, 1, 1, 2]) }, visionModel('depth-anything-v2-small')!, transform);

    expect(result.depth).toEqual({ values: new Float32Array([1, 2]), width: 2, height: 1, relative: true });
  });
});
