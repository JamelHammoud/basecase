import { describe, expect, it } from 'vitest';
import { decode } from './decode';
import { preprocess } from './preprocess';
import { visionModel } from './catalogue';
import type { VisionOutputs } from './types';

const transform = { width: 640, height: 640, scaledWidth: 640, scaledHeight: 480, left: 0, top: 80 };
const tensor = (data: number[], dims: number[]) => ({ data, dims });

describe('real vision adapters', () => {
  it('decodes YOLO class channels and removes letterbox padding in camera coordinates', () => {
    const values = Array(84).fill(0);

    values.splice(0, 5, 320, 320, 320, 240, 0.9);

    const result = decode({ output0: tensor(values, [1, 84, 1]) }, visionModel('yolo11n')!, transform);

    expect(result.detections).toEqual([{ label: 'person', score: 0.9, box: [0.25, 0.25, 0.5, 0.5] }]);
  });

  it('decodes sparse RFDETR classes without suppressing overlapping predictions', () => {
    const values = Array(182).fill(-10);

    values[1] = 4;
    values[92] = 3;

    const outputs = {
      pred_boxes: tensor([0.5, 0.5, 0.4, 0.4, 0.5, 0.5, 0.4, 0.4], [1, 2, 4]),
      pred_logits: tensor(values, [1, 2, 91]),
    };
    const result = decode(outputs, visionModel('rfdetr-nano')!, { ...transform, scaledHeight: 640, top: 0 });

    expect(result.detections).toHaveLength(2);
    expect(result.detections[0].label).toBe('person');
  });

  it('retains each above-threshold RF-DETR query and class pair in score order', () => {
    const values = Array(91).fill(-10);

    values[1] = 3;
    values[17] = 4;

    const outputs = {
      pred_boxes: tensor([0.5, 0.5, 0.4, 0.4], [1, 1, 4]),
      pred_logits: tensor(values, [1, 1, 91]),
    };
    const result = decode(outputs, visionModel('rfdetr-nano')!, { ...transform, scaledHeight: 640, top: 0 });

    expect(result.detections.map(({ label }) => label)).toEqual(['cat', 'person']);
    expect(result.detections[0].box).toEqual(result.detections[1].box);
  });

  it('decodes YuNet multi-stride scores, box exponents and face landmarks', () => {
    const outputs: VisionOutputs = {};

    for (const stride of [8, 16, 32]) {
      const count = (640 / stride) ** 2;

      outputs[`cls_${stride}`] = tensor(Array(count).fill(0), [1, count, 1]);
      outputs[`obj_${stride}`] = tensor(Array(count).fill(0), [1, count, 1]);
      outputs[`bbox_${stride}`] = tensor(Array(count * 4).fill(0), [1, count, 4]);
      outputs[`kps_${stride}`] = tensor(Array(count * 10).fill(0), [1, count, 10]);
    }

    (outputs.cls_8.data as number[])[81] = 0.81;
    (outputs.obj_8.data as number[])[81] = 1;

    const result = decode(outputs, visionModel('yunet')!, { ...transform, scaledHeight: 640, top: 0 });

    expect(result.detections[0]).toMatchObject({
      label: 'face',
      score: 0.9,
      box: [0.00625, 0.00625, 0.012499999999999999, 0.012499999999999999],
    });
    expect(result.detections[0].keypoints).toHaveLength(5);
  });

  it('normalizes RGB and raw BGR in planar layout', () => {
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const input = { ...visionModel('yunet')!.input, width: 1, height: 1 };

    expect([...preprocess(pixels, input).data]).toEqual([30, 20, 10]);
  });
});

const genericManifest = (kind: 'segment' | 'keypoints' | 'classify') => ({
  ...visionModel('yolo11n')!,
  adapter: 'generic' as const,
  classes: ['person'],
  kind,
});
const genericRows = () => tensor([0.1, 0.1, 0.2, 0.2, 0.1, 0, 0.5, 0.5, 0.2, 0.2, 0.9, 0], [1, 2, 6]);

describe('generic vision row alignment', () => {
  it('keeps the retained mask tied to its original detection row', () => {
    const result = decode(
      { detections: genericRows(), masks: tensor([1, 0, 0, 1], [1, 2, 1, 2]) },
      genericManifest('segment'),
      transform,
    );

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].mask).toEqual({ width: 2, height: 1, values: new Uint8Array([0, 1]) });
  });

  it('keeps the retained landmarks tied to their original detection row', () => {
    const result = decode(
      { detections: genericRows(), keypoints: tensor([0.1, 0.2, 0.8, 0.9], [2, 1, 2]) },
      genericManifest('keypoints'),
      transform,
    );

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].keypoints).toEqual([[0.8, 0.9]]);
  });

  it('supports unbatched detection rows and one finite classifier score per class', () => {
    const manifest = { ...genericManifest('classify'), classes: ['person', 'cat'] };

    expect(decode({ scores: tensor([0.2, 0.8], [1, 2]) }, manifest, transform).classes).toEqual([
      { label: 'cat', score: 0.8 },
      { label: 'person', score: 0.2 },
    ]);
    expect(
      decode(
        { detections: tensor(genericRows().data, [2, 6]), keypoints: tensor([0.1, 0.2, 0.8, 0.9], [1, 2, 1, 2]) },
        genericManifest('keypoints'),
        transform,
      ).detections[0].keypoints,
    ).toEqual([[0.8, 0.9]]);
  });
});

describe('generic vision tensor validation', () => {
  it('refuses malformed masks and nonfinite values before allocating result masks', () => {
    const malformed = [
      tensor([1, 0], [1, 1, 2]),
      tensor([1, 0, 0, 1], [2, 2]),
      tensor([], [2, 0, 2]),
      tensor([], [2, 1, 2049]),
      tensor([1, 0, 0], [2, 1, 2]),
      tensor([NaN, 0, 0, 1], [2, 1, 2]),
      tensor([1, 0, 0, Infinity], [2, 1, 2]),
    ];

    for (const masks of malformed)
      expect(() => decode({ detections: genericRows(), masks }, genericManifest('segment'), transform)).toThrow();
  });

  it('refuses malformed landmark tensors, including data from filtered rows', () => {
    const malformed = [
      tensor([0.1, 0.2], [1, 1, 2]),
      tensor([0.1, 0.2, 0.3, 0.4], [2, 2]),
      tensor([], [2, 1025, 2]),
      tensor([0.1, 0.2, 0.3, 0.4], [2, 1, 3]),
      tensor([0.1, 0.2, 0.3], [2, 1, 2]),
      tensor([NaN, 0.2, 0.3, 0.4], [2, 1, 2]),
      tensor([0.1, 0.2, 0.3, Infinity], [2, 1, 2]),
    ];

    for (const keypoints of malformed)
      expect(() => decode({ detections: genericRows(), keypoints }, genericManifest('keypoints'), transform)).toThrow();
  });

  it('refuses mismatched detection and classifier tensor shapes', () => {
    const detections = [
      tensor(genericRows().data, [3, 6]),
      tensor(genericRows().data, [2, 1, 6]),
      tensor(genericRows().data, [2, 6.1]),
    ];

    for (const rows of detections)
      expect(() =>
        decode({ detections: rows, masks: tensor([1, 0, 0, 1], [2, 1, 2]) }, genericManifest('segment'), transform),
      ).toThrow();

    expect(() => decode({ scores: tensor([1], [1, 1, 1]) }, genericManifest('classify'), transform)).toThrow();
    expect(() => decode({ scores: tensor([NaN], [1]) }, genericManifest('classify'), transform)).toThrow();
  });
});

describe('built-in vision tensor validation', () => {
  it('refuses malformed or nonfinite YOLO tensors before decoding detections', () => {
    const manifest = visionModel('yolo11n')!;
    const values = Array(84).fill(0);
    const attacks = [
      tensor(values, [2, 84, 1]),
      tensor(values, [1, 84, 2]),
      tensor(values, [84, 1.5]),
      tensor([...values.slice(0, -1), NaN], [1, 84, 1]),
      tensor([], [1, 84, 10001]),
    ];

    for (const output of attacks) expect(() => decode({ output }, manifest, transform)).toThrow();
  });

  it('refuses inconsistent RF-DETR row counts and nonfinite unused logits', () => {
    const manifest = visionModel('rfdetr-nano')!;
    const boxes = tensor([0.5, 0.5, 0.4, 0.4], [1, 1, 4]);
    const logits = tensor(Array(91).fill(-10), [1, 1, 91]);

    expect(() =>
      decode({ pred_boxes: boxes, pred_logits: tensor(Array(182).fill(0), [1, 2, 91]) }, manifest, transform),
    ).toThrow();
    expect(() =>
      decode({ pred_boxes: { ...boxes, dims: [2, 1, 4] }, pred_logits: logits }, manifest, transform),
    ).toThrow();
    expect(() =>
      decode(
        { pred_boxes: boxes, pred_logits: tensor([Infinity, ...Array(90).fill(0)], [1, 1, 91]) },
        manifest,
        transform,
      ),
    ).toThrow();
  });

  it('refuses truncated YuNet outputs even when every face score is below threshold', () => {
    expect(() => decode({ cls_8: tensor([0], [1, 1, 1]) }, visionModel('yunet')!, transform)).toThrow();
  });

  it('bounds depth dimensions and rank before copying result values', () => {
    const manifest = visionModel('depth-anything-v2-small')!;
    const attacks = [
      tensor([1, 2], [2, 1, 1]),
      tensor([1, 2], [1, 2, 1, 1]),
      tensor([1, 2], [1, 2.5]),
      tensor([1, Infinity], [1, 1, 2]),
      tensor([1, 1e100], [1, 1, 2]),
      tensor([], [1, 0, 1]),
      tensor(Array(2049).fill(1), [1, 1, 2049]),
    ];

    for (const output of attacks) expect(() => decode({ output }, manifest, transform)).toThrow();

    expect(decode({ output: tensor([1, 2], [1, 1, 1, 2]) }, manifest, transform).depth?.values).toEqual(
      new Float32Array([1, 2]),
    );
  });
});
