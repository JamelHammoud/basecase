import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { visionModel } from './catalogue';
import type { VisionOutputs, VisionTensor } from './types';

const transform = { width: 32, height: 32, scaledWidth: 32, scaledHeight: 32, left: 0, top: 0 };
const tensor = (data: number[], dims: number[]) => ({ data, dims });
const yolo = () => ({ output0: tensor([16, 16, 8, 8, 0.9, ...Array(79).fill(0)], [1, 84, 1]) });
const rfdetr = () => ({
  pred_boxes: tensor([0.5, 0.5, 0.2, 0.2], [1, 1, 4]),
  pred_logits: tensor([-10, 4, ...Array(89).fill(-10)], [1, 1, 91]),
});

function faces(): VisionOutputs {
  return Object.fromEntries(
    [8, 16, 32].flatMap((stride) => {
      const count = (32 / stride) ** 2;

      return [
        [`cls_${stride}`, tensor(Array(count).fill(0.81), [1, count, 1])],
        [`obj_${stride}`, tensor(Array(count).fill(1), [1, count, 1])],
        [`bbox_${stride}`, tensor(Array(count * 4).fill(0), [1, count, 4])],
        [`kps_${stride}`, tensor(Array(count * 10).fill(0), [1, count, 10])],
      ];
    }),
  );
}

describe('vision adapter output validation', () => {
  it('rejects truncated, nonfinite and malformed YOLO outputs', () => {
    const valid = yolo().output0;
    const malformed = [
      tensor(valid.data.slice(1), valid.dims),
      tensor([NaN, ...valid.data.slice(1)], valid.dims),
      tensor(valid.data, [2, 84, 1]),
      tensor([], [1, 84, -1]),
    ];

    for (const output0 of malformed)
      expect(() => decode({ output0 }, visionModel('yolo11n')!, transform)).toThrow(/unsupported tensors/);
  });

  it('rejects RFDETR tensors with mismatched rows and nonfinite boxes', () => {
    const valid = rfdetr();
    const malformed = [
      { ...valid, pred_boxes: tensor([NaN, 0.5, 0.2, 0.2], [1, 1, 4]) },
      { ...valid, pred_logits: tensor(valid.pred_logits.data, [1, 2, 91]) },
      { ...valid, pred_boxes: tensor(valid.pred_boxes.data, [2, 1, 4]) },
    ];

    for (const outputs of malformed)
      expect(() => decode(outputs, visionModel('rfdetr-nano')!, transform)).toThrow(/unsupported tensors/);
  });

  it('rejects YuNet output lengths and box exponents that cannot produce finite coordinates', () => {
    const valid = faces();
    const malformed = [
      { ...valid, bbox_8: tensor([0, 0, 0], [1, 16, 4]) },
      { ...valid, obj_8: tensor(Array(16).fill(NaN), [1, 16, 1]) },
      { ...valid, bbox_8: tensor([0, 0, 1000, 0, ...Array(60).fill(0)], [1, 16, 4]) },
    ];

    for (const outputs of malformed)
      expect(() => decode(outputs, visionModel('yunet')!, transform)).toThrow(/unsupported tensors/);
  });

  it('checks depth dimensions and value counts before copying the output', () => {
    const malformed: VisionTensor[] = [tensor([1], [-1, -1]), tensor([1, 2], [1, 2, 1, 1])];

    for (const depth of malformed)
      expect(() => decode({ depth }, visionModel('depth-anything-v2-small')!, transform)).toThrow(
        /unsupported tensors/,
      );

    let read = false;
    const depth = {
      dims: [1, 4096, 4097],
      data: {
        length: 4096 * 4097,
        get 0(): number {
          read = true;

          throw new Error('Read before validation');
        },
      },
    };

    expect(() => decode({ depth }, visionModel('depth-anything-v2-small')!, transform)).toThrow(/unsupported tensors/);
    expect(read).toBe(false);
  });
});
