import { describe, expect, it } from 'vitest';
import { prepareFrame } from './preprocess';
import { decodeVision } from './decode';
import { VISION_MODELS } from './manifest';

const person = VISION_MODELS[0];

describe('vision image pipeline', () => {
  it('preserves RGB planes, letterbox padding and coordinates on a non-square frame', () => {
    const model = { ...person, inputSize: [2, 2] as [number, number], classes: ['person'] };
    const frame = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const input = prepareFrame(frame, model);

    expect(Array.from(input.data)).toEqual(
      [1, 0, 114 / 255, 114 / 255, 0, 1, 114 / 255, 114 / 255, 0, 0, 114 / 255, 114 / 255].map(Math.fround),
    );

    const result = decodeVision(
      { output0: { dims: [1, 5, 1], data: new Float32Array([1, 0.5, 1, 1, 0.9]) } },
      model,
      input.transform,
    );

    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].box).toEqual([0.25, 0, 0.5, 1]);
  });

  it('suppresses overlapping boxes only within their class and rejects NaN confidence', () => {
    const model = { ...person, inputSize: [2, 2] as [number, number], classes: ['person', 'cat'] };
    const transform = prepareFrame({ width: 2, height: 2, data: new Uint8ClampedArray(16) }, model).transform;
    const output = {
      dims: [1, 6, 4],
      data: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.1, NaN, 0.1, 0.2, 0.95, NaN]),
    };
    const result = decodeVision({ output }, model, transform);

    expect(result.detections?.map((item) => item.label)).toEqual(['cat', 'person']);
  });

  it('decodes DETR logits and keeps relative depth distinct from metres', () => {
    const detector = { ...VISION_MODELS[1], classes: ['person', 'cat'] };
    const transform = prepareFrame({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, detector).transform;
    const result = decodeVision(
      {
        dets: { dims: [1, 1, 4], data: new Float32Array([0.5, 0.5, 0.5, 0.5]) },
        labels: { dims: [1, 1, 2], data: new Float32Array([2, -2]) },
      },
      detector,
      transform,
    );

    expect(result.detections?.[0].score).toBeCloseTo(0.880797);
    expect(result.detections?.[0].box).toEqual([0.25, 0.25, 0.5, 0.5]);

    const depth = decodeVision(
      { predicted_depth: { dims: [1, 1, 2], data: new Float32Array([4, 12]) } },
      VISION_MODELS[2],
      transform,
    );

    expect(Array.from(depth.depth?.values ?? [])).toEqual([4, 12]);
  });

  it('refuses malformed image buffers and unsupported tensor layouts', () => {
    expect(() => prepareFrame({ width: 2, height: 1, data: new Uint8ClampedArray(4) }, person)).toThrow();

    const transform = {
      width: 1,
      height: 1,
      resizedWidth: 1,
      resizedHeight: 1,
      offsetX: 0,
      offsetY: 0,
      inputWidth: 1,
      inputHeight: 1,
    };

    expect(() => decodeVision({ output: { dims: [1], data: new Float32Array(1) } }, person, transform)).toThrow();
  });
});
